/**
 * Embedded MPV Player Component
 *
 * This component provides a fully-featured video player using embedded MPV
 * with audio/subtitle track switching, seek controls, and fullscreen support.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  embeddedMpvService,
  type EmbeddedPlayerState,
  type AudioTrack,
  type SubtitleTrack,
} from "../services/embeddedMpvService";
import { openSubtitlesService, type Subtitle } from "../services";
import type { SkipSegment } from "../services/skipIntro";
import { useSettingsStore } from "../stores/settingsStore";
import {
  AlertTriangle,
  Play,
  Pause,
  VolumeX,
  Volume2,
  Volume1,
  Tv,
  SkipForward,
  Maximize,
  Minimize,
  X,
  StarFilled,
} from "./Icons";
import "./EmbeddedMpvPlayer.css";

/**
 * Map common ISO 639-1 (2-letter) codes to ISO 639-2/B (3-letter) codes
 * so we can compare embedded track languages (which MPV may report in
 * either format) against the user's preferred language setting (always 3-letter).
 */
const ISO_639_1_TO_2: Record<string, string> = {
  en: "eng", nl: "dut", de: "ger", fr: "fre", es: "spa", it: "ita",
  pt: "por", ru: "rus", ja: "jpn", ko: "kor", zh: "chi", ar: "ara",
  hi: "hin", pl: "pol", sv: "swe", da: "dan", fi: "fin", nb: "nor",
  no: "nor", tr: "tur", cs: "cze", hu: "hun", ro: "rum", el: "gre",
  he: "heb", th: "tha", vi: "vie", uk: "ukr", id: "ind", ms: "may",
  hr: "hrv", bg: "bul", sk: "slo", sr: "srp", sl: "slv", et: "est",
  lv: "lav", lt: "lit", ka: "geo", fa: "per", ur: "urd", ta: "tam",
};

/**
 * Map full language names to 3-letter codes for matching
 * when tracks only have a title like "English" but lang is "und".
 */
const LANG_NAME_TO_CODE: Record<string, string> = {
  english: "eng", dutch: "dut", german: "ger", french: "fre",
  spanish: "spa", italian: "ita", portuguese: "por", russian: "rus",
  japanese: "jpn", korean: "kor", chinese: "chi", arabic: "ara",
  hindi: "hin", polish: "pol", swedish: "swe", danish: "dan",
  finnish: "fin", norwegian: "nor", turkish: "tur", czech: "cze",
  hungarian: "hun", romanian: "rum", greek: "gre", hebrew: "heb",
  thai: "tha", vietnamese: "vie", ukrainian: "ukr",
};

/** Normalise a language tag to its 3-letter ISO 639-2 form. */
function normLang(raw: string): string {
  const l = raw.toLowerCase().trim();
  return ISO_639_1_TO_2[l] || LANG_NAME_TO_CODE[l] || l;
}

/** Check if two language tags refer to the same language. */
function langMatches(trackLang: string, preferred: string): boolean {
  const a = normLang(trackLang);
  const b = normLang(preferred);
  // Exact match after normalisation
  if (a === b) return true;
  // Substring containment for less-standard tags (e.g. "en-US" contains "eng"?)
  // Only when one string fully contains the other at the prefix level
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

/**
 * Score an embedded subtitle track to determine quality/relevance.
 * Higher = better.  A score < 0 means "do not use this track".
 *
 * Language logic:
 *   • If the track matches the user's preferred language → big bonus (+1000).
 *   • If not, but the track is English → moderate bonus (+300) as a
 *     reasonable fallback, ONLY when the preferred language is NOT English
 *     (i.e. the user's preferred is e.g. Italian but no Italian embedded
 *     track exists → English is acceptable but online Italian is still
 *     preferable, so the online loader can still beat this score).
 *   • Unknown language ("und" / blank) → small bonus (+100) – could be
 *     anything.
 *   • Non-matching, non-English track → penalty (-200) – almost certainly
 *     not useful.
 */
function scoreEmbeddedTrack(
  track: SubtitleTrack,
  preferredLang: string,
): number {
  let score = 0;
  const lang = (track.lang || "").toLowerCase();
  const title = (track.title || "").toLowerCase();
  const pref = preferredLang.toLowerCase();

  // ─── Language scoring ───────────────────────────────────────────
  // Try matching by lang field first, then fall back to title for
  // tracks that have lang="und" or empty but "English" in the title.
  const langMatchesPref = lang && pref && langMatches(lang, pref);
  const titleMatchesPref =
    !langMatchesPref &&
    (!lang || lang === "und") &&
    pref &&
    title &&
    langMatches(title, pref);

  if (langMatchesPref || titleMatchesPref) {
    // Preferred-language match (via lang tag or title)
    score += 1000;
  } else if (!lang || lang === "und") {
    // Unknown language — could be the right one
    score += 100;
  } else if (pref !== "eng" && langMatches(lang, "eng")) {
    // English track as fallback when user prefers another language.
    // Score is positive so the track *can* be used, but low enough that
    // an online subtitle in the user's preferred language will win.
    score += 300;
  } else {
    // Track in a completely different language the user didn't ask for
    score -= 200;
  }

  // ─── Content-type penalties ─────────────────────────────────────
  if (title.includes("forced")) score -= 500;
  if (title.includes("sign") && !title.includes("full")) score -= 400;
  if (title.includes("song") && !title.includes("full")) score -= 300;

  // Bonus for "full" dialog subtitles
  if (title.includes("full")) score += 200;

  // Prefer tracks with proper names (well-tagged)
  if (track.title && track.title.length > 0) score += 50;

  // ─── Codec preference: text-based > bitmap-based ───────────────
  if (track.codec) {
    const codec = track.codec.toLowerCase();
    if (codec.includes("srt") || codec.includes("subrip")) score += 30;
    else if (codec.includes("ass") || codec.includes("ssa")) score += 25;
    else if (codec.includes("webvtt") || codec.includes("vtt")) score += 20;
    else score += 5;
  }

  return score;
}

export interface EpisodeInfo {
  id: string;
  episodeNumber: number;
  name: string;
  still?: string;
  progress?: number;
}

interface EmbeddedMpvPlayerProps {
  url: string;
  title?: string;
  imdbId?: string;
  season?: number;
  episode?: number;
  onClose?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onProgress?: (position: number, duration: number) => void;
  onSubtitleSelectionChange?: (subtitleId: string | null) => void;
  onSubtitleOffsetChange?: (offset: number) => void;
  onAudioTrackChange?: (audioTrackId: string | null) => void;
  initialPosition?: number;
  initialSubtitleId?: string | null;
  initialSubtitleOffset?: number;
  initialAudioTrackId?: string | null;
  preferredAudioLang?: string;
  preferredSubtitleLang?: string;
  autoPlay?: boolean;
  // Episode navigation
  isSeries?: boolean;
  currentEpisode?: number;
  episodes?: EpisodeInfo[];
  onEpisodeSelect?: (episodeNumber: number) => void;
  onNextEpisode?: () => void;
  blurUnwatched?: boolean;
  // Season selection
  seasons?: number[];
  currentSeason?: number;
  onSeasonChange?: (seasonNum: number) => void;
  isLoadingEpisodes?: boolean;
  skipSegments?: SkipSegment[];
}

export function EmbeddedMpvPlayer({
  url,
  title,
  imdbId,
  season,
  episode,
  onClose,
  onEnded,
  onError,
  onProgress,
  onSubtitleSelectionChange,
  onSubtitleOffsetChange,
  onAudioTrackChange,
  initialPosition,
  initialSubtitleId,
  initialSubtitleOffset = 0,
  initialAudioTrackId,
  preferredAudioLang = "eng",
  preferredSubtitleLang = "eng",
  autoPlay = true,
  isSeries = false,
  currentEpisode,
  episodes = [],
  onEpisodeSelect,
  onNextEpisode,
  blurUnwatched = false,
  seasons = [],
  currentSeason,
  onSeasonChange,
  isLoadingEpisodes = false,
  skipSegments = [],
}: EmbeddedMpvPlayerProps) {
  const [state, setState] = useState<EmbeddedPlayerState | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showEpisodeMenu, setShowEpisodeMenu] = useState(false);
  const [, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subtitleDelay, setSubtitleDelay] = useState(initialSubtitleOffset);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Online subtitles (Stremio OpenSubtitles addon)
  const [onlineSubtitles, setOnlineSubtitles] = useState<Subtitle[]>([]);
  const [isLoadingOnlineSubtitles, setIsLoadingOnlineSubtitles] =
    useState(false);
  const [activeOnlineSubtitleId, setActiveOnlineSubtitleId] = useState<
    string | null
  >(null);
  const onlineSubAutoSelectedRef = useRef(false);
  const onlineSubtitleToMpvSidRef = useRef<Map<string, number>>(new Map());

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedPreferences = useRef(false);
  const hasSeekToInitial = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const eofRecoveryAttempts = useRef(0);
  const hasRestoredInitialSubtitleRef = useRef(false);
  const hasAutoSelectedEmbeddedSubRef = useRef(false);
  const autoSelectedSubScoreRef = useRef<number | null>(null);
  const hasOpenMenuRef = useRef(false);

  useEffect(() => {
    setSubtitleDelay(initialSubtitleOffset);
  }, [initialSubtitleOffset]);

  useEffect(() => {
    hasRestoredInitialSubtitleRef.current = false;
    hasAutoSelectedEmbeddedSubRef.current = false;
    autoSelectedSubScoreRef.current = null;
    eofRecoveryAttempts.current = 0;
    // Reset online subtitle state so previous episode's choice doesn't block embedded auto-select
    setActiveOnlineSubtitleId(null);
    setOnlineSubtitles([]);
    onlineSubtitleToMpvSidRef.current.clear();
    onlineSubAutoSelectedRef.current = false;
  }, [url]);

  // Keep menu-open ref in sync so controls timeout can check it
  useEffect(() => {
    hasOpenMenuRef.current =
      showSubtitleMenu || showAudioMenu || showEpisodeMenu;
  }, [showSubtitleMenu, showAudioMenu, showEpisodeMenu]);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = state?.isPlaying ?? false;
  }, [state?.isPlaying]);

  // Initialize MPV and load the video
  useEffect(() => {
    // Skip if already loaded this URL
    if (loadedUrlRef.current === url) {
      console.log("Already loaded this URL, skipping:", url);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const initAndPlay = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize MPV
        console.log("Initializing MPV for URL:", url);
        await embeddedMpvService.initialize();

        if (!mounted) return;

        // Set video margins - no margins for true fullscreen
        // The controls overlay on top with gradients
        await embeddedMpvService.setMargins({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        });

        // Subscribe to state changes
        unsubscribe = embeddedMpvService.onPropertyChange(
          (updates: Partial<EmbeddedPlayerState>) => {
            if (!mounted) return;

            setState((prev: EmbeddedPlayerState | null) => {
              const base = prev || embeddedMpvService.getState();
              // When autoPlay is enabled and this is the first state
              // initialisation (prev == null), assume playing so the UI
              // shows the Pause icon immediately instead of briefly
              // flashing the Play icon until MPV confirms playback.
              if (!prev && autoPlay && updates.isPaused === undefined) {
                base.isPaused = false;
                base.isPlaying = true;
              }
              return { ...base, ...updates };
            });

            // Check for EOF — guard against premature EOF from network stalls
            if (updates.eofReached === true) {
              const { position: pos, duration: dur } = embeddedMpvService.getState();
              const nearEnd = dur > 0 && pos > 0 && (pos / dur >= 0.9 || dur - pos < 300);

              if (nearEnd) {
                onEnded?.();
              } else if (eofRecoveryAttempts.current < 3) {
                eofRecoveryAttempts.current++;
                console.warn(
                  `Premature EOF at ${pos.toFixed(0)}s/${dur.toFixed(0)}s — recovery attempt ${eofRecoveryAttempts.current}/3`
                );
                // Seek back slightly to re-trigger demuxer buffering
                embeddedMpvService.seek(Math.max(0, pos - 3)).catch(() => {});
                setTimeout(() => embeddedMpvService.play().catch(() => {}), 500);
              } else {
                onError?.("Stream connection lost. The download link may have expired.");
              }
            }

            // Reset recovery counter when playback resumes normally
            if (updates.isPlaying === true) {
              eofRecoveryAttempts.current = 0;
            }

            // Report progress
            if (
              updates.position !== undefined ||
              updates.duration !== undefined
            ) {
              const currentState = embeddedMpvService.getState();
              onProgress?.(currentState.position, currentState.duration);
            }
          },
        );

        // Load the file
        console.log("Loading file in MPV:", url);
        await embeddedMpvService.loadFile(url);

        if (!mounted) {
          unsubscribe?.();
          return;
        }

        // Mark this URL as loaded
        loadedUrlRef.current = url;

        // Handle initial pause state
        if (autoPlay) {
          console.log("Auto-playing...");
          // Wait a moment for MPV to finish loading before setting pause state
          await new Promise((r) => setTimeout(r, 100));
          await embeddedMpvService.play();

          // Some mpv builds can briefly re-assert `pause` while loading.
          // Retry unpausing to ensure autoplay works reliably.
          setTimeout(() => {
            if (!mounted) return;
            const state = embeddedMpvService.getState();
            if (state.isPaused) {
              embeddedMpvService.play().catch((e) => {
                console.warn("Retry autoplay failed:", e);
              });
            }
          }, 750);
        } else {
          // Explicitly pause if autoplay is disabled
          await new Promise((r) => setTimeout(r, 100));
          await embeddedMpvService.pause().catch(() => undefined);
        }

        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error("MPV initialization/load error:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
      }
    };

    initAndPlay();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Apply preferred AUDIO track once audio tracks are available (one-time).
  // Priority: 1) saved audio track from CW resumption (initialAudioTrackId)
  //           2) series-level audio pref (same lang/title across episodes)
  //           3) preferred audio language from settings
  useEffect(() => {
    if (hasAppliedPreferences.current) return;
    if (!state?.audioTracks.length) return;

    // Wait a moment to ensure tracks are fully registered in MPV
    const timer = setTimeout(() => {
      if (hasAppliedPreferences.current) return;
      hasAppliedPreferences.current = true;

      console.log("Applying preferred audio track:", {
        audioTracks: state.audioTracks.length,
      });

      // 1) Restore saved audio track by ID (CW resume for same episode)
      if (initialAudioTrackId) {
        const savedId = parseInt(initialAudioTrackId, 10);
        const savedTrack = !Number.isNaN(savedId)
          ? state.audioTracks.find((t) => t.id === savedId)
          : undefined;
        if (savedTrack && !savedTrack.selected) {
          console.log("Restoring saved audio track:", savedTrack);
          embeddedMpvService.setAudioTrack(savedTrack.id).catch((e) => {
            console.warn("Failed to restore saved audio track:", e);
          });
          onAudioTrackChange?.(String(savedTrack.id));
          return;
        }
      }

      // 2) Series-level audio pref (match by lang + title from previous episode)
      if (isSeries && imdbId) {
        const seriesPref = useSettingsStore.getState().getSeriesSubtitleSelection(imdbId);
        if (seriesPref?.audioLang) {
          const match = state.audioTracks.find((t) => {
            const tLang = (t.lang || "").toLowerCase();
            const pLang = (seriesPref.audioLang || "").toLowerCase();
            const tTitle = (t.title || "").toLowerCase();
            const pTitle = (seriesPref.audioTitle || "").toLowerCase();
            return tLang === pLang && (!pTitle || tTitle === pTitle);
          });
          if (match && !match.selected) {
            console.log("Setting series-preferred audio:", match);
            embeddedMpvService.setAudioTrack(match.id).catch((e) => {
              console.warn("Failed to set series-preferred audio track:", e);
            });
            onAudioTrackChange?.(String(match.id));
            return;
          }
        }
      }

      // 3) Preferred audio language from settings
      const preferredAudio = state.audioTracks.find((t: AudioTrack) =>
        t.lang?.toLowerCase().includes(preferredAudioLang.toLowerCase()),
      );
      if (preferredAudio && !preferredAudio.selected) {
        console.log("Setting preferred audio:", preferredAudio);
        embeddedMpvService.setAudioTrack(preferredAudio.id).catch((e) => {
          console.warn("Failed to set preferred audio track:", e);
        });
        onAudioTrackChange?.(String(preferredAudio.id));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [state?.audioTracks, preferredAudioLang, initialAudioTrackId, isSeries, imdbId, onAudioTrackChange]);

  // Auto-select the best embedded subtitle whenever subtitle tracks update.
  // This handles late-discovered embedded tracks (MPV demuxes progressively).
  // Allows upgrading: if better tracks arrive later they replace the earlier pick.
  // If no good embedded tracks exist, disables embedded subs so online addon can take over.
  // For series: if the user previously selected a subtitle on another episode and
  // a matching track exists here, prefer it over generic scoring.
  useEffect(() => {
    // Need subtitle tracks to exist
    if (!state?.subtitleTracks?.length) return;
    // Skip if an online subtitle was manually selected by the user
    if (activeOnlineSubtitleId && !onlineSubAutoSelectedRef.current) return;
    // Skip if we are restoring a saved subtitle
    if (initialSubtitleId && !hasRestoredInitialSubtitleRef.current) return;

    // Find and score embedded (non-external) subtitles, excluding known-empty tracks
    const embeddedTracks = state.subtitleTracks.filter((t) => !t.external);
    if (embeddedTracks.length === 0) return;

    // --- Series subtitle persistence ---
    // If this is a series and the user previously chose a subtitle on another episode,
    // try to find the same track by lang/title/codec match.
    if (isSeries && imdbId && !hasAutoSelectedEmbeddedSubRef.current) {
      const seriesPref = useSettingsStore.getState().getSeriesSubtitleSelection(imdbId);
      // If series pref says "online", block embedded auto-select and let online loader handle it
      if (seriesPref && seriesPref.type === "online") {
        console.log("Series subtitle pref is online; skipping embedded auto-select.");
        hasAutoSelectedEmbeddedSubRef.current = true;
        return;
      }
      if (seriesPref && seriesPref.type === "embedded") {
        // Find all tracks matching lang/title/codec
        const candidates = embeddedTracks.filter((t) => {
          const tLang = (t.lang || "").toLowerCase();
          const pLang = (seriesPref.lang || "").toLowerCase();
          const tTitle = (t.title || "").toLowerCase();
          const pTitle = (seriesPref.title || "").toLowerCase();
          const tCodec = (t.codec || "").toLowerCase();
          const pCodec = (seriesPref.codec || "").toLowerCase();
          return tLang === pLang && tTitle === pTitle && (!pCodec || tCodec === pCodec);
        });
        // Use trackIndex to pick the correct duplicate (e.g. 2nd English track)
        const match = candidates.length > 0
          ? candidates[Math.min(seriesPref.trackIndex ?? 0, candidates.length - 1)]
          : undefined;
        if (match) {
          const matchScore = scoreEmbeddedTrack(match, preferredSubtitleLang);
          console.log(
            "Series subtitle preference matched:",
            match,
            "score:",
            matchScore,
          );
          autoSelectedSubScoreRef.current = matchScore;
          hasAutoSelectedEmbeddedSubRef.current = true;
          setState((prev) =>
            prev ? { ...prev, currentSubtitleTrack: match.id } : prev,
          );
          embeddedMpvService.setSubtitleTrack(match.id).catch((e) => {
            console.warn("Failed to set series-preferred subtitle track:", e);
          });
          onSubtitleSelectionChange?.(`embedded:${match.id}`);
          return;
        }
      }
    }

    const scored = embeddedTracks
      .map((t) => ({
        track: t,
        score: scoreEmbeddedTrack(t, preferredSubtitleLang),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    // No good embedded subtitles — disable any MPV auto-selected sub
    // and let the online subtitle loader take over.
    if (best.score < 0) {
      if (!hasAutoSelectedEmbeddedSubRef.current) {
        hasAutoSelectedEmbeddedSubRef.current = true;
        console.log(
          "No good embedded subtitles (best score:",
          best.score,
          "), disabling embedded and deferring to online",
        );
        embeddedMpvService.setSubtitleTrack(0).catch(() => {});
      }
      return;
    }

    // Only select if this is the first selection or if a higher-scored track appeared
    if (
      autoSelectedSubScoreRef.current !== null &&
      best.score <= autoSelectedSubScoreRef.current
    ) {
      return;
    }

    const targetSub = best.track;
    console.log(
      "Auto-selecting best embedded subtitle:",
      targetSub,
      "score:",
      best.score,
      autoSelectedSubScoreRef.current !== null ? "(upgrade)" : "(initial)",
      activeOnlineSubtitleId ? "(overriding auto-selected online sub)" : "",
    );
    autoSelectedSubScoreRef.current = best.score;
    hasAutoSelectedEmbeddedSubRef.current = true;

    // If an auto-selected online sub is active, clear it — embedded is better
    if (activeOnlineSubtitleId && onlineSubAutoSelectedRef.current) {
      setActiveOnlineSubtitleId(null);
      onlineSubAutoSelectedRef.current = false;
    }

    // Immediately update UI state
    setState((prev) =>
      prev ? { ...prev, currentSubtitleTrack: targetSub.id } : prev,
    );
    embeddedMpvService.setSubtitleTrack(targetSub.id).catch((e) => {
      console.warn("Failed to auto-select embedded subtitle track:", e);
    });
    onSubtitleSelectionChange?.(`embedded:${targetSub.id}`);
  }, [
    state?.subtitleTracks,
    activeOnlineSubtitleId,
    preferredSubtitleLang,
    initialSubtitleId,
    onSubtitleSelectionChange,
  ]);

  // Seek to initial position once duration is known
  useEffect(() => {
    if (hasSeekToInitial.current) return;
    if (!initialPosition || !state?.duration) return;

    hasSeekToInitial.current = true;
    embeddedMpvService.seek(initialPosition);
  }, [initialPosition, state?.duration]);

  // Handle controls visibility and cursor hiding
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(function tick() {
      // Don't hide controls while a menu panel is open — but reschedule
      if (hasOpenMenuRef.current) {
        controlsTimeoutRef.current = setTimeout(tick, 1000);
        return;
      }
      if (isPlayingRef.current) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  // Mouse movement shows controls
  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          embeddedMpvService.togglePause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          embeddedMpvService.seekRelative(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          embeddedMpvService.seekRelative(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          embeddedMpvService.setVolume(
            Math.min(100, (state?.volume || 100) + 5),
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          embeddedMpvService.setVolume(Math.max(0, (state?.volume || 100) - 5));
          break;
        case "m":
          e.preventDefault();
          embeddedMpvService.toggleMute();
          break;
        case "f":
          e.preventDefault();
          handleToggleFullscreen();
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state?.volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      embeddedMpvService.stop();
    };
  }, []);

  // Click on video area toggles play/pause and shows controls
  const handleVideoAreaClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      embeddedMpvService.togglePause();
      showControlsTemporarily();
    },
    [showControlsTemporarily],
  );

  // Load online subtitles (OpenSubtitles via Stremio addon) for embedded MPV
  useEffect(() => {
    if (!imdbId) return;

    const { subtitles: subPrefs } = useSettingsStore.getState();
    if (!subPrefs.autoLoad) {
      setOnlineSubtitles([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      // Skip online subtitle auto-load when user has a saved embedded subtitle choice
      if (initialSubtitleId?.startsWith("embedded:")) {
        console.log("Saved embedded subtitle exists; skipping online auto-load.");
        return;
      }
      // For addon subtitle restore, still load online subs so the restore useEffect can match
      const isRestoringAddon = initialSubtitleId?.startsWith("addon:");
      setIsLoadingOnlineSubtitles(true);
      try {
        const languages = [
          subPrefs.defaultLanguage || preferredSubtitleLang,
          ...subPrefs.secondaryLanguages,
        ].filter(Boolean);

        const subs = await openSubtitlesService.search({
          imdbId,
          season,
          episode,
          languages,
        });

        if (cancelled) return;
        setOnlineSubtitles(subs);

        // Auto-select best online subtitle only if no good embedded sub exists.
        // Wait for MPV to discover embedded tracks, then directly score them
        // (avoids race condition with the embedded auto-select useEffect).
        //
        // Score thresholds (from scoreEmbeddedTrack):
        //   >= 1000  →  Embedded track in the user's preferred language → keep it
        //   300-999  →  English fallback → online preferred-lang can override
        //   < 300    →  Unknown / weak → online preferred-lang wins
        if (subs.length > 0) {
          // Wait for MPV to demux and discover subtitle tracks (progressive)
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelled) return;

          const defaultLang = subPrefs.defaultLanguage || preferredSubtitleLang;

          // Directly score embedded tracks from MPV's current state
          // instead of relying on the auto-select useEffect's ref timing
          const currentState = embeddedMpvService.getState();
          const embeddedTracks = currentState.subtitleTracks.filter(
            (t) => !t.external,
          );

          // If embedded tracks exist, wait a bit more to catch late arrivals
          if (embeddedTracks.length > 0) {
            await new Promise((r) => setTimeout(r, 1500));
            if (cancelled) return;
          }

          // Re-read after possible second wait
          const finalState = embeddedMpvService.getState();
          const finalEmbedded = finalState.subtitleTracks.filter(
            (t) => !t.external,
          );

          // Compute the best embedded score directly
          let bestEmbeddedScore = -Infinity;
          if (finalEmbedded.length > 0) {
            for (const t of finalEmbedded) {
              const s = scoreEmbeddedTrack(t, defaultLang);
              if (s > bestEmbeddedScore) bestEmbeddedScore = s;
            }
          }

          // Check if the user's series pref is "online" — if so, prefer addon subs
          // even when good embedded subs exist (user explicitly chose addon last time)
          const seriesOnlinePref = isSeries && imdbId
            ? useSettingsStore.getState().getSeriesSubtitleSelection(imdbId)
            : null;
          const preferOnline = seriesOnlinePref?.type === "online";

          // Always prefer embedded subtitles when any usable one exists,
          // UNLESS the user's series pref says "online" (they chose addon before).
          if (bestEmbeddedScore > 0 && !preferOnline) {
            console.log(
              "Embedded subtitle available (score:",
              bestEmbeddedScore,
              "); skipping addon subtitle autoload.",
            );
            return;
          }

          // Look for online subs in the user's preferred language
          const onlinePrefLang = preferOnline && seriesOnlinePref?.onlineSubLang
            ? seriesOnlinePref.onlineSubLang
            : defaultLang;
          const defaultLangSubs = subs.filter(
            (s) => s.languageCode === onlinePrefLang,
          );

          const pool = defaultLangSubs.length > 0 ? defaultLangSubs : subs;
          const best = pool[0];

          // Prefer hearing impaired if enabled
          const bestHi = subPrefs.preferHearingImpaired
            ? pool.find((s) => s.hearing_impaired)
            : undefined;

          const chosen = bestHi || best;

          // Only autoload if we haven't selected something yet
          // and user doesn't have a saved subtitle choice to restore
          if (!activeOnlineSubtitleId && !initialSubtitleId && !isRestoringAddon) {
            console.log(
              "Auto-selecting online subtitle:",
              chosen?.language,
              "(best embedded score was:",
              bestEmbeddedScore,
              ")",
            );
            await handleSelectOnlineSubtitle(chosen, true);
            onlineSubAutoSelectedRef.current = true;
          }
        }
      } catch (e) {
        console.warn("Failed to load online subtitles:", e);
      } finally {
        if (!cancelled) setIsLoadingOnlineSubtitles(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imdbId, season, episode]);

  const handleSelectOnlineSubtitle = useCallback(
    async (subtitle: Subtitle | null, isAuto: boolean = false) => {
      if (!isAuto) onlineSubAutoSelectedRef.current = false;
      if (!subtitle) {
        setActiveOnlineSubtitleId(null);
        onSubtitleSelectionChange?.(null);
        try {
          await embeddedMpvService.setSubtitleTrack(0);
        } catch (e) {
          console.warn("Failed to disable subtitles:", e);
        }
        if (!isAuto) showControlsTemporarily();
        return;
      }

      // Save series-level pref for online subtitle language
      if (!isAuto && isSeries && imdbId) {
        const existing = useSettingsStore.getState().getSeriesSubtitleSelection(imdbId);
        useSettingsStore.getState().setSeriesSubtitleSelection(imdbId, {
          type: "online",
          lang: subtitle.language || null,
          title: null,
          codec: null,
          onlineSubLang: subtitle.language || undefined,
          audioLang: existing?.audioLang,
          audioTitle: existing?.audioTitle,
        });
      }

      const existingSid = onlineSubtitleToMpvSidRef.current.get(subtitle.id);
      if (existingSid) {
        setActiveOnlineSubtitleId(subtitle.id);
        onSubtitleSelectionChange?.(`addon:${subtitle.languageCode}`);
        try {
          await embeddedMpvService.setSubtitleTrack(existingSid);
        } catch (e) {
          console.warn("Failed to select existing online subtitle:", e);
        }
        if (!isAuto) showControlsTemporarily();
        return;
      }

      const sid = await embeddedMpvService.addExternalSubtitle(
        subtitle.downloadUrl,
        true,
      );

      if (sid) {
        onlineSubtitleToMpvSidRef.current.set(subtitle.id, sid);
        setActiveOnlineSubtitleId(subtitle.id);
        onSubtitleSelectionChange?.(`addon:${subtitle.languageCode}`);
      } else {
        console.info(
          "No selectable sid reported after sub-add for this subtitle source",
        );
      }
      if (!isAuto) showControlsTemporarily();
    },
    [showControlsTemporarily, onSubtitleSelectionChange, isSeries, imdbId],
  );

  const handleToggleFullscreen = useCallback(async () => {
    const window = getCurrentWindow();
    const newFullscreenState = !isFullscreen;
    await window.setFullscreen(newFullscreenState);
    setIsFullscreen(newFullscreenState);
  }, [isFullscreen]);

  const handleClose = useCallback(async () => {
    // Exit fullscreen before closing if needed
    if (isFullscreen) {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
    }
    await embeddedMpvService.stop();
    onClose?.();
  }, [onClose, isFullscreen]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseFloat(e.target.value);
    embeddedMpvService.seek(position);
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const volume = parseFloat(e.target.value);
      embeddedMpvService.setVolume(volume);
    },
    [],
  );

  const handleAudioTrackSelect = useCallback(async (track: AudioTrack) => {
    console.log("Selecting audio track:", track);
    setShowAudioMenu(false);
    try {
      await embeddedMpvService.setAudioTrack(track.id);
      onAudioTrackChange?.(String(track.id));

      // Save audio preference for series (update existing series pref or create one)
      if (isSeries && imdbId) {
        const existing = useSettingsStore.getState().getSeriesSubtitleSelection(imdbId);
        useSettingsStore.getState().setSeriesSubtitleSelection(imdbId, {
          ...(existing || { type: "embedded", lang: null, title: null, codec: null }),
          audioLang: track.lang,
          audioTitle: track.title,
        });
      }

      console.log("Audio track set successfully");
    } catch (e) {
      console.error("Failed to set audio track:", e);
    }
  }, [onAudioTrackChange, isSeries, imdbId]);

  const handleSubtitleTrackSelect = useCallback(
    async (track: SubtitleTrack | null) => {
      console.log("Selecting embedded subtitle track:", track);
      // Clear online subtitle selection when selecting embedded track
      setActiveOnlineSubtitleId(null);

      // Immediately update React state for responsive UI (don't wait for MPV observer)
      setState((prev) =>
        prev ? { ...prev, currentSubtitleTrack: track ? track.id : 0 } : prev,
      );

      // Save series-level subtitle preference so next episode auto-selects the same track
      if (isSeries && imdbId && track) {
        const existing = useSettingsStore.getState().getSeriesSubtitleSelection(imdbId);
        // Compute trackIndex: position among tracks with identical lang/title/codec
        const allTracks = embeddedMpvService.getState().subtitleTracks.filter((t) => !t.external);
        const sameGroup = allTracks.filter(
          (t) =>
            (t.lang || "").toLowerCase() === (track.lang || "").toLowerCase() &&
            (t.title || "").toLowerCase() === (track.title || "").toLowerCase() &&
            (t.codec || "").toLowerCase() === (track.codec || "").toLowerCase(),
        );
        const trackIndex = sameGroup.findIndex((t) => t.id === track.id);
        useSettingsStore.getState().setSeriesSubtitleSelection(imdbId, {
          type: "embedded",
          lang: track.lang,
          title: track.title,
          codec: track.codec,
          trackIndex: trackIndex >= 0 ? trackIndex : 0,
          audioLang: existing?.audioLang,
          audioTitle: existing?.audioTitle,
        });
      }

      try {
        if (track === null) {
          await embeddedMpvService.setSubtitleTrack(0);
          onSubtitleSelectionChange?.(null);
        } else {
          await embeddedMpvService.setSubtitleTrack(track.id);
          onSubtitleSelectionChange?.(`embedded:${track.id}`);
        }
        console.log("Subtitle track set successfully");
      } catch (e) {
        console.error("Failed to set subtitle track:", e);
      }
    },
    [onSubtitleSelectionChange, isSeries, imdbId],
  );

  const handleSubtitleDelayChange = useCallback(
    (delta: number) => {
      const newDelay = subtitleDelay + delta;
      setSubtitleDelay(newDelay);
      embeddedMpvService.setSubtitleDelay(newDelay);
      onSubtitleOffsetChange?.(newDelay);
    },
    [subtitleDelay, onSubtitleOffsetChange],
  );

  useEffect(() => {
    if (!initialSubtitleId || hasRestoredInitialSubtitleRef.current) return;

    if (initialSubtitleId.startsWith("embedded:")) {
      const sid = parseInt(initialSubtitleId.split(":")[1], 10);
      if (!Number.isNaN(sid) && state?.subtitleTracks?.length) {
        const embeddedTrack = state.subtitleTracks.find((t) => t.id === sid);
        if (embeddedTrack) {
          console.log("Restoring saved embedded subtitle:", sid);
          hasRestoredInitialSubtitleRef.current = true;
          // Block auto-select from overriding the restored choice
          hasAutoSelectedEmbeddedSubRef.current = true;
          autoSelectedSubScoreRef.current = Infinity;
          handleSubtitleTrackSelect(embeddedTrack);
        }
      }
      return;
    }

    // Addon subtitle restore — saved as "addon:<languageCode>"
    if (initialSubtitleId.startsWith("addon:")) {
      const savedLang = initialSubtitleId.split(":")[1];
      console.log("Restoring addon subtitle, lang:", savedLang, "online subs loaded:", onlineSubtitles.length);
      if (onlineSubtitles.length > 0) {
        // Match by language code
        const onlineMatch = onlineSubtitles.find(
          (s) => s.languageCode === savedLang,
        ) || onlineSubtitles.find(
          (s) => s.languageCode.startsWith(savedLang.slice(0, 2)),
        );
        if (onlineMatch) {
          console.log("Restoring addon subtitle:", onlineMatch.language);
          hasRestoredInitialSubtitleRef.current = true;
          hasAutoSelectedEmbeddedSubRef.current = true;
          autoSelectedSubScoreRef.current = Infinity;
          handleSelectOnlineSubtitle(onlineMatch, true);
        } else {
          console.log("No addon subtitle match for lang:", savedLang);
        }
      }
      return;
    }

    // Legacy: old-format addon subtitle ID (before addon: prefix) — try language fallback
    if (onlineSubtitles.length > 0) {
      const onlineMatch = onlineSubtitles.find(
        (s) => s.id === initialSubtitleId,
      );
      if (onlineMatch) {
        console.log("Restoring legacy addon subtitle by ID:", onlineMatch.language);
        hasRestoredInitialSubtitleRef.current = true;
        hasAutoSelectedEmbeddedSubRef.current = true;
        autoSelectedSubScoreRef.current = Infinity;
        handleSelectOnlineSubtitle(onlineMatch, true);
      }
    }
  }, [
    initialSubtitleId,
    onlineSubtitles,
    state?.subtitleTracks,
    handleSelectOnlineSubtitle,
    handleSubtitleTrackSelect,
  ]);

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Language code to name mapping
  const langNames: Record<string, string> = {
    eng: "English",
    en: "English",
    jpn: "Japanese",
    ja: "Japanese",
    spa: "Spanish",
    es: "Spanish",
    fre: "French",
    fr: "French",
    ger: "German",
    de: "German",
    ita: "Italian",
    it: "Italian",
    por: "Portuguese",
    pt: "Portuguese",
    rus: "Russian",
    ru: "Russian",
    chi: "Chinese",
    zh: "Chinese",
    kor: "Korean",
    ko: "Korean",
    ara: "Arabic",
    ar: "Arabic",
    hin: "Hindi",
    hi: "Hindi",
    und: "Unknown",
  };

  // Group tracks by language for better organization
  // Puts the preferred language first
  const groupTracksByLanguage = <T extends AudioTrack | SubtitleTrack>(
    tracks: T[],
    preferredLang: string,
  ): Map<string, T[]> => {
    const grouped = new Map<string, T[]>();

    tracks.forEach((track) => {
      const lang = track.lang?.toLowerCase() || "und";
      let langName = langNames[lang] || lang.toUpperCase();

      // For subtitle tracks without language info, label them as "Embedded"
      // instead of "Unknown" when they are not external
      if (
        langName === "Unknown" &&
        "external" in track &&
        !(track as SubtitleTrack).external
      ) {
        langName = "Embedded";
      }

      if (!grouped.has(langName)) {
        grouped.set(langName, []);
      }
      grouped.get(langName)!.push(track);
    });

    // Get preferred language name for sorting
    const prefLangName =
      langNames[preferredLang.toLowerCase()] || preferredLang.toUpperCase();

    // Sort by language name: English always first, then preferred (if not English), then alphabetical
    const sorted = new Map<string, T[]>();
    const entries = Array.from(grouped.entries()).sort((a, b) => {
      // English always first
      if (a[0] === "English") return -1;
      if (b[0] === "English") return 1;
      // Then preferred language (if not English)
      if (a[0] === prefLangName) return -1;
      if (b[0] === prefLangName) return 1;
      return a[0].localeCompare(b[0]);
    });
    entries.forEach(([key, value]) => sorted.set(key, value));

    return sorted;
  };

  // Get grouped audio and subtitle tracks - use preferred languages for ordering
  const groupedAudioTracks = state?.audioTracks
    ? groupTracksByLanguage(state.audioTracks, preferredAudioLang)
    : new Map();
  // Only group non-external (embedded) subtitle tracks here.
  // External tracks added via sub-add are already handled by the onlineSubtitles array.
  const embeddedSubtitleTracks = state?.subtitleTracks?.filter(
    (t) => !t.external,
  );

  // Score & sort embedded tracks for the subtitle panel
  const scoredEmbeddedTracks = (embeddedSubtitleTracks || [])
    .map((t) => ({
      track: t,
      score: scoreEmbeddedTrack(t, preferredSubtitleLang),
    }))
    .sort((a, b) => b.score - a.score);

  // Group online subtitles by language for the subtitle panel
  const groupedOnlineSubs = onlineSubtitles.reduce(
    (acc, sub) => {
      const lang = sub.language || sub.languageCode || "Unknown";
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(sub);
      return acc;
    },
    {} as Record<string, Subtitle[]>,
  );

  // Calculate progress percentage for CSS
  const progressPercent = state?.duration
    ? ((state?.position || 0) / state.duration) * 100
    : 0;

  if (error) {
    return (
      <div className="embedded-mpv-player embedded-mpv-player--error">
        <div className="embedded-mpv-error">
          <span className="embedded-mpv-error__icon">
            <AlertTriangle size={40} />
          </span>
          <h3>Playback Error</h3>
          <p>{error}</p>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`embedded-mpv-player ${showControls ? "embedded-mpv-player--controls-visible" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (state?.isPlaying && !hasOpenMenuRef.current) {
          setShowControls(false);
          setShowAudioMenu(false);
        }
      }}
    >
      {/* The MPV video renders behind this transparent div - click to play/pause */}
      <div
        className="embedded-mpv-player__video-area"
        onClick={handleVideoAreaClick}
      />

      {/* Loading overlay — hidden; PlayerPage provides its own cinematic
           loading screen. Keeping the state so external consumers can check. */}

      {/* Controls overlay */}
      <div
        className={`embedded-mpv-player__controls ${showControls ? "visible" : ""}`}
      >
        {/* Top bar */}
        <div className="embedded-mpv-controls__top">
          <button
            className="embedded-mpv-btn embedded-mpv-btn--back"
            onClick={handleClose}
          >
            ← Back
          </button>
          <h2 className="embedded-mpv-controls__title">{title}</h2>
          {(state?.duration ?? 0) > 0 && (state?.position ?? 0) < (state?.duration ?? 0) ? (
            <div className="embedded-mpv-controls__clock">
              <span className="embedded-mpv-controls__clock-now">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="embedded-mpv-controls__clock-ends">
                ends at{" "}
                {new Date(
                  Date.now() + ((state?.duration ?? 0) - (state?.position ?? 0)) * 1000,
                ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ) : (
            <div className="embedded-mpv-controls__spacer" />
          )}
        </div>

        {/* Bottom bar */}
        <div className="embedded-mpv-controls__bottom">
          {/* Progress bar */}
          <div className="embedded-mpv-controls__progress">
            <span className="embedded-mpv-controls__time">
              {formatTime(state?.position || 0)}
            </span>
            <div className="embedded-mpv-controls__slider-wrapper">
              <input
                type="range"
                className="embedded-mpv-controls__slider"
                min={0}
                max={state?.duration || 100}
                value={state?.position || 0}
                onChange={handleSeek}
                style={
                  { "--progress": `${progressPercent}%` } as React.CSSProperties
                }
              />
              {/* Skip segment markers */}
              {(state?.duration || 0) > 0 && skipSegments.map((seg, i) => (
                <div
                  key={i}
                  className={`embedded-mpv-segment-marker embedded-mpv-segment-marker--${seg.type === "outro" || seg.type === "mixed-outro" ? "outro" : seg.type === "recap" ? "recap" : "intro"}`}
                  style={{
                    left: `${(seg.startTime / (state?.duration || 1)) * 100}%`,
                    width: `${((seg.endTime - seg.startTime) / (state?.duration || 1)) * 100}%`,
                  }}
                />
              ))}
            </div>
            <span className="embedded-mpv-controls__time">
              {formatTime(state?.duration || 0)}
            </span>
          </div>

          {/* Control buttons */}
          <div className="embedded-mpv-controls__buttons">
            {/* Play/Pause */}
            <button
              className="embedded-mpv-btn"
              onClick={() => embeddedMpvService.togglePause()}
              title={state?.isPaused ? "Play" : "Pause"}
            >
              {(state?.isPaused ?? false) ? <Play size={20} /> : <Pause size={20} />}
            </button>

            {/* Volume */}
            <button
              className="embedded-mpv-btn"
              onClick={() => embeddedMpvService.toggleMute()}
              title={state?.muted ? "Unmute" : "Mute"}
            >
              {state?.muted || (state?.volume ?? 100) === 0 ? (
                <VolumeX size={20} />
              ) : (
                <Volume2 size={20} />
              )}
            </button>
            <input
              type="range"
              className="embedded-mpv-controls__volume-slider"
              min={0}
              max={100}
              value={state?.muted ? 0 : (state?.volume ?? 100)}
              onChange={handleVolumeChange}
            />

            <div className="embedded-mpv-controls__spacer" />

            {/* Episodes button for series */}
            {isSeries && episodes.length > 0 && (
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEpisodeMenu(!showEpisodeMenu);
                  setShowAudioMenu(false);
                  setShowSubtitleMenu(false);
                }}
                title="Episodes"
              >
                <Tv size={16} /> Episodes
              </button>
            )}

            {/* Next Episode button for series */}
            {isSeries && onNextEpisode && (
              <button
                className="embedded-mpv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextEpisode();
                }}
                title="Next Episode"
              >
                <SkipForward size={20} />
              </button>
            )}

            {/* Audio track selector */}
            <button
              className={`embedded-mpv-btn embedded-mpv-btn--audio ${(state?.audioTracks?.length ?? 0) > 1 ? "embedded-mpv-btn--audio-multi" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowAudioMenu(!showAudioMenu);
                setShowSubtitleMenu(false);
                setShowEpisodeMenu(false);
              }}
              title="Audio Track"
            >
              <span className="embedded-mpv-audio-icon">
                <Volume1 size={16} />
              </span>
              <span className="embedded-mpv-audio-label">Audio</span>
            </button>

            {/* Subtitle selector */}
            <button
              className={`embedded-mpv-btn embedded-mpv-btn--cc ${(state?.currentSubtitleTrack || 0) !== 0 || activeOnlineSubtitleId ? "embedded-mpv-btn--cc-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowSubtitleMenu(!showSubtitleMenu);
                setShowAudioMenu(false);
                setShowEpisodeMenu(false);
              }}
              title="Subtitles"
            >
              <span className="embedded-mpv-cc-icon">CC</span>
              <span className="embedded-mpv-cc-status">
                {activeOnlineSubtitleId
                  ? "ADD"
                  : (state?.currentSubtitleTrack || 0) !== 0
                    ? "EMB"
                    : "OFF"}
              </span>
            </button>

            {/* Fullscreen */}
            <button
              className="embedded-mpv-btn"
              onClick={handleToggleFullscreen}
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Subtitle Panel Overlay */}
      {showSubtitleMenu && (
        <div
          className="embedded-mpv-subtitle-overlay"
          onClick={() => setShowSubtitleMenu(false)}
        >
          <div
            className="embedded-mpv-subtitle-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="embedded-mpv-subtitle-panel__header">
              <h3>Subtitles</h3>
              <button
                className="embedded-mpv-subtitle-panel__close"
                onClick={() => setShowSubtitleMenu(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="embedded-mpv-subtitle-panel__list">
              {/* Off option — pinned, never scrolls */}
              <div className="embedded-mpv-subtitle-panel__off-row">
                <button
                  className={`embedded-mpv-subtitle-panel__item ${
                    !activeOnlineSubtitleId &&
                    (state?.currentSubtitleTrack ?? 0) === 0
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setActiveOnlineSubtitleId(null);
                    handleSubtitleTrackSelect(null);
                  }}
                >
                  <span className="embedded-mpv-subtitle-panel__label">Off</span>
                </button>
              </div>

              {/* Column headers */}
              <div className="embedded-mpv-subtitle-panel__col-header">
                <div className="embedded-mpv-subtitle-panel__col-tab">Embedded</div>
                <div className="embedded-mpv-subtitle-panel__col-tab">Addon</div>
              </div>

              {/* Two-column layout: Embedded | Addon */}
              <div className="embedded-mpv-subtitle-panel__columns">
                {/* Embedded tracks column */}
                <div className="embedded-mpv-subtitle-panel__column">
                  <div className="embedded-mpv-subtitle-panel__section-label">
                    Embedded Tracks
                  </div>
                  {scoredEmbeddedTracks.length > 0 ? (
                    scoredEmbeddedTracks.map(({ track, score }) => {
                      const isSelected =
                        !activeOnlineSubtitleId &&
                        ((state?.currentSubtitleTrack || 0) === track.id ||
                          track.selected);
                      const langKey = track.lang?.toLowerCase() || "und";
                      const langLabel =
                        langNames[langKey] ||
                        track.lang?.toUpperCase() ||
                        "Unknown";
                      return (
                        <button
                          key={`emb-${track.id}`}
                          className={`embedded-mpv-subtitle-panel__item ${
                            isSelected ? "active" : ""
                          }`}
                          onClick={() => handleSubtitleTrackSelect(track)}
                        >
                          <div className="embedded-mpv-subtitle-panel__info">
                            <span className="embedded-mpv-subtitle-panel__label">
                              {langLabel}
                            </span>
                            <div className="embedded-mpv-subtitle-panel__meta">
                              <span className="embedded-mpv-subtitle-panel__badge emb">
                                EMB
                              </span>
                              {track.title && (
                                <span className="embedded-mpv-subtitle-panel__badge">
                                  {track.title}
                                </span>
                              )}
                              {track.codec && (
                                <span className="embedded-mpv-subtitle-panel__badge codec">
                                  {track.codec.toUpperCase()}
                                </span>
                              )}
                              {score > 500 && (
                                <span className="embedded-mpv-subtitle-panel__quality">
                                  <StarFilled size={12} /> Best
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="embedded-mpv-subtitle-panel__column-empty">
                      None available
                    </div>
                  )}
                </div>

                {/* Addon subtitles column */}
                <div className="embedded-mpv-subtitle-panel__column">
                  <div className="embedded-mpv-subtitle-panel__section-label">
                    Addon Subtitles
                  </div>
                  {Object.keys(groupedOnlineSubs).length > 0 ? (
                    Object.entries(groupedOnlineSubs).map(([lang, subs]) => (
                      <div
                        key={lang}
                        className="embedded-mpv-subtitle-panel__lang-group"
                      >
                        <div className="embedded-mpv-subtitle-panel__lang-header">
                          {lang}
                        </div>
                        {subs.map((sub) => {
                          const mappedSid =
                            onlineSubtitleToMpvSidRef.current.get(sub.id);
                          const isSelected =
                            activeOnlineSubtitleId === sub.id ||
                            (!!mappedSid &&
                              (state?.currentSubtitleTrack || 0) === mappedSid);
                          return (
                            <button
                              key={`onl-${sub.id}`}
                              className={`embedded-mpv-subtitle-panel__item ${
                                isSelected ? "active" : ""
                              }`}
                              onClick={() => handleSelectOnlineSubtitle(sub)}
                              title={sub.fileName}
                            >
                              <div className="embedded-mpv-subtitle-panel__info">
                                <span className="embedded-mpv-subtitle-panel__label">
                                  {sub.language || sub.languageCode}
                                </span>
                                <div className="embedded-mpv-subtitle-panel__meta">
                                  <span className="embedded-mpv-subtitle-panel__badge addon">
                                    ADDON
                                  </span>
                                  {sub.hearing_impaired && (
                                    <span className="embedded-mpv-subtitle-panel__badge hi">
                                      HI
                                    </span>
                                  )}
                                  {sub.foreignPartsOnly && (
                                    <span className="embedded-mpv-subtitle-panel__badge">
                                      Foreign
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  ) : isLoadingOnlineSubtitles ? (
                    <div className="embedded-mpv-subtitle-panel__column-empty">
                      Loading...
                    </div>
                  ) : (
                    <div className="embedded-mpv-subtitle-panel__column-empty">
                      None available
                    </div>
                  )}
                </div>
              </div>

              {/* Empty state — only when both are empty */}
              {!isLoadingOnlineSubtitles &&
                scoredEmbeddedTracks.length === 0 &&
                Object.keys(groupedOnlineSubs).length === 0 && (
                  <div className="embedded-mpv-subtitle-panel__empty">
                    No subtitles available
                  </div>
                )}
            </div>

            {/* Timing controls */}
            {((state?.currentSubtitleTrack ?? 0) !== 0 ||
              activeOnlineSubtitleId) && (
              <div className="embedded-mpv-subtitle-panel__timing">
                <div className="embedded-mpv-subtitle-panel__timing-header">
                  <span>Timing Adjustment</span>
                  <span className="embedded-mpv-subtitle-panel__timing-value">
                    {subtitleDelay > 0 ? "+" : ""}
                    {subtitleDelay.toFixed(1)}s
                  </span>
                </div>
                <div className="embedded-mpv-subtitle-panel__timing-controls">
                  <button
                    className="embedded-mpv-subtitle-panel__timing-btn"
                    onClick={() => handleSubtitleDelayChange(-1)}
                  >
                    -1s
                  </button>
                  <button
                    className="embedded-mpv-subtitle-panel__timing-btn"
                    onClick={() => handleSubtitleDelayChange(-0.1)}
                  >
                    -0.1s
                  </button>
                  <button
                    className="embedded-mpv-subtitle-panel__timing-btn"
                    onClick={() => {
                      setSubtitleDelay(0);
                      embeddedMpvService.setSubtitleDelay(0);
                      onSubtitleOffsetChange?.(0);
                    }}
                  >
                    Reset
                  </button>
                  <button
                    className="embedded-mpv-subtitle-panel__timing-btn"
                    onClick={() => handleSubtitleDelayChange(0.1)}
                  >
                    +0.1s
                  </button>
                  <button
                    className="embedded-mpv-subtitle-panel__timing-btn"
                    onClick={() => handleSubtitleDelayChange(1)}
                  >
                    +1s
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audio Panel Overlay */}
      {showAudioMenu && (
        <div
          className="embedded-mpv-subtitle-overlay"
          onClick={() => setShowAudioMenu(false)}
        >
          <div
            className="embedded-mpv-subtitle-panel embedded-mpv-audio-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="embedded-mpv-subtitle-panel__header">
              <h3>Audio Tracks</h3>
              <button
                className="embedded-mpv-subtitle-panel__close"
                onClick={() => setShowAudioMenu(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="embedded-mpv-subtitle-panel__list">
              {groupedAudioTracks.size === 0 ? (
                <div className="embedded-mpv-subtitle-panel__empty">
                  No audio tracks available
                </div>
              ) : (
                Array.from(groupedAudioTracks.entries()).map(
                  ([langName, tracks]) => (
                    <div
                      key={langName}
                      className="embedded-mpv-subtitle-panel__section"
                    >
                      <div className="embedded-mpv-subtitle-panel__lang-header">
                        {langName}
                      </div>
                      {tracks.map((track: AudioTrack) => {
                        const isSelected =
                          track.selected ||
                          (state?.currentAudioTrack || 0) === track.id;
                        const channelStr = track.channels
                          ? track.channels === 2
                            ? "Stereo"
                            : track.channels === 6
                              ? "5.1 Surround"
                              : track.channels === 8
                                ? "7.1 Surround"
                                : `${track.channels}ch`
                          : "";
                        return (
                          <button
                            key={track.id}
                            className={`embedded-mpv-subtitle-panel__item ${
                              isSelected ? "active" : ""
                            }`}
                            onClick={() => handleAudioTrackSelect(track)}
                          >
                            <div className="embedded-mpv-subtitle-panel__info">
                              <span className="embedded-mpv-subtitle-panel__label">
                                {track.title ||
                                  langNames[track.lang?.toLowerCase() || ""] ||
                                  track.lang?.toUpperCase() ||
                                  `Track ${track.id}`}
                              </span>
                              <div className="embedded-mpv-subtitle-panel__meta">
                                {track.codec && (
                                  <span className="embedded-mpv-subtitle-panel__badge codec">
                                    {track.codec.toUpperCase()}
                                  </span>
                                )}
                                {channelStr && (
                                  <span className="embedded-mpv-subtitle-panel__badge">
                                    {channelStr}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Episode Menu Overlay */}
      {showEpisodeMenu && isSeries && episodes.length > 0 && (
        <div
          className="embedded-mpv-episode-overlay"
          onClick={() => setShowEpisodeMenu(false)}
        >
          <div
            className="embedded-mpv-episode-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="embedded-mpv-episode-header">
              {seasons.length > 1 && onSeasonChange ? (
                <select
                  className="embedded-mpv-season-selector"
                  value={currentSeason}
                  onChange={(e) => onSeasonChange(parseInt(e.target.value))}
                >
                  {seasons.map((s) => (
                    <option key={s} value={s}>Season {s}</option>
                  ))}
                </select>
              ) : (
                <h3>Episodes</h3>
              )}
              <button
                className="embedded-mpv-episode-close"
                onClick={() => setShowEpisodeMenu(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="embedded-mpv-episode-list">
              {isLoadingEpisodes ? (
                <div className="embedded-mpv-episode-loading">Loading episodes...</div>
              ) : (
              episodes.map((ep) => {
                const isCurrent = currentSeason === season && ep.episodeNumber === currentEpisode;
                const isWatched = ep.progress !== undefined && ep.progress > 0;
                const shouldBlur = blurUnwatched && !isWatched && ep.still;
                return (
                  <div
                    key={ep.id}
                    className={`embedded-mpv-episode-item ${isCurrent ? "current" : ""}`}
                    onClick={() => {
                      if (!isCurrent && onEpisodeSelect) {
                        onEpisodeSelect(ep.episodeNumber);
                        setShowEpisodeMenu(false);
                      }
                    }}
                  >
                    <div
                      className={`embedded-mpv-episode-thumbnail ${shouldBlur ? "blur" : ""}`}
                    >
                      {ep.still ? (
                        <img src={ep.still} alt={ep.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="embedded-mpv-episode-placeholder">
                          <Tv size={28} />
                        </div>
                      )}
                      {isCurrent && (
                        <div className="embedded-mpv-episode-playing">
                          <Play size={14} /> Now Playing
                        </div>
                      )}
                      {ep.progress !== undefined &&
                        ep.progress > 0 &&
                        !isCurrent && (
                          <div className="embedded-mpv-episode-progress">
                            <div
                              className="embedded-mpv-episode-progress-fill"
                              style={{ width: `${ep.progress}%` }}
                            />
                          </div>
                        )}
                    </div>
                    <div className="embedded-mpv-episode-info">
                      <span className="embedded-mpv-episode-num">
                        E{ep.episodeNumber}
                      </span>
                      <span className="embedded-mpv-episode-title">
                        {ep.name}
                      </span>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmbeddedMpvPlayer;
