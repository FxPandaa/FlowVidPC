import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  cinemetaService,
  openSubtitlesService,
  Subtitle,
  createSubtitleBlobUrl,
  adjustSubtitleTiming,
  skipIntroService,
} from "../services";
import type { AddonStream } from "../services/addons/types";
import type { SkipSegment } from "../services";
import { useLibraryStore, useSettingsStore } from "../stores";
import { useAddonStore, type AddonStreamResult } from "../stores/addonStore";
import {
  SubtitleSelector,
  SubtitleOverlay,
  AudioTrackSelector,
  AudioTrack,
  EmbeddedMpvPlayer,
  SourceSelectPopup,
} from "../components";
import { parseStreamInfo } from "../utils/streamParser";
import { embeddedMpvService } from "../services/embeddedMpvService";
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Pause,
  VolumeX,
  Volume1,
  Volume2,
  SkipForward,
  Maximize,
  Minimize,
  X,
  Tv,
  DolbyVisionBadge,
  HDR10Badge,
  HDR10PlusBadge,
  DolbyAtmosBadge,
  HDRBadge,
} from "../components/Icons";
import "./PlayerPage.css";

export function PlayerPage() {
  const { type, id, season, episode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [addonStreamResults, setAddonStreamResults] = useState<AddonStreamResult[]>([]);
  const [pendingAddons, setPendingAddons] = useState<string[]>([]);
  const [selectedStream, setSelectedStream] = useState<AddonStream | null>(
    null,
  );
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);
  const [showStreamInfo, setShowStreamInfo] = useState(false);
  const [useEmbeddedMpv, setUseEmbeddedMpv] = useState(false);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<Subtitle | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [hasEmbeddedSubtitleTracks, setHasEmbeddedSubtitleTracks] =
    useState(false);
  const [mpvSubtitleId, setMpvSubtitleId] = useState<string | null>(null);
  const [mpvSubtitleOffset, setMpvSubtitleOffset] = useState(0);
  const [mpvAudioTrackId, setMpvAudioTrackId] = useState<string | null>(null);

  // Audio track state
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<string | null>(null);

  // Player controls — default to true since we autoplay
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [contentDetails, setContentDetails] = useState<any>(null);
  const [showEpisodeMenu, setShowEpisodeMenu] = useState(false);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);
  const [episodeMenuSeason, setEpisodeMenuSeason] = useState<number>(parseInt(season || "1"));
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  // Tracks how many times we've retried fetching the stream URL (to detect expired links)
  const [streamRetryCount, setStreamRetryCount] = useState(0);

  // Ref: fire stream-info overlay exactly once per load
  const playbackReadyFiredRef = useRef(false);

  // Skip intro state
  const [skipSegments, setSkipSegments] = useState<SkipSegment[]>([]);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const activeSkipRef = useRef<SkipSegment | null>(null);
  const [autoSkipNotice, setAutoSkipNotice] = useState<string | null>(null);
  const autoSkippedSegmentsRef = useRef<Set<string>>(new Set());

  // Next episode auto-play state
  const [showNextEpisodePopup, setShowNextEpisodePopup] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(0);
  const [nextEpisodeInfo, setNextEpisodeInfo] = useState<{ season: number; episode: number; title: string; thumbnail?: string } | null>(null);
  const nextEpisodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextEpisodeDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextEpisodeDismissedRef = useRef(false);
  const playNextEpisodeSeamlesslyRef = useRef<() => void>(() => {});
  const [popupInstance, setPopupInstance] = useState(0);

  const { updateWatchProgress, getWatchProgress, removeFromHistory, addToLibrary, isInLibrary, markItemWatched } = useLibraryStore();
  const {
    autoPlay,
    subtitleAppearance,
    blurUnwatchedEpisodes,
    playerType,
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    skipIntro: skipIntroSetting,
    skipOutro: skipOutroSetting,
  } = useSettingsStore();
  const { getStreamsProgressive } = useAddonStore();

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // ── Local-first sync refs ──────────────────────────────────────────────
  // Always-fresh position/duration for server sync interval (avoids stale closures)
  const latestPosRef = useRef({ pos: 0, dur: 0 });
  // Server sync interval handle
  const serverSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable ref to latest saveProgress function (for setInterval / event listeners)
  const saveProgressRef = useRef<(localOnly?: boolean) => void>(() => {});
  // Track last MPV local save position
  const lastMpvLocalSavePos = useRef(0);

  // Generate CSS custom properties for subtitle styling (with fallbacks for older settings)
  const subtitleStyles = {
    "--subtitle-font-size": `${subtitleAppearance.fontSize ?? 22}px`,
    "--subtitle-font-family": subtitleAppearance.fontFamily ?? "sans-serif",
    "--subtitle-text-color": subtitleAppearance.textColor ?? "#FFFFFF",
    "--subtitle-bg-color": subtitleAppearance.backgroundColor ?? "#000000",
    "--subtitle-bg-opacity": subtitleAppearance.backgroundOpacity ?? 0.75,
    "--subtitle-text-shadow": subtitleAppearance.textShadow
      ? "2px 2px 4px rgba(0,0,0,0.8)"
      : "none",
    "--subtitle-line-height": subtitleAppearance.lineHeight ?? 1.4,
    "--subtitle-bottom-position": `${subtitleAppearance.bottomPosition ?? 10}%`,
  } as React.CSSProperties;

  // Track whether we already marked this content as finished (prevent duplicate calls)
  const markedFinishedRef = useRef(false);

  // Mark content as fully watched: save 100%, remove from CW, add to library
  const markAsFinished = () => {
    if (markedFinishedRef.current || !contentDetails || !id) return;
    markedFinishedRef.current = true;

    // Save final progress = 100
    updateWatchProgress({
      imdbId: id,
      type: type as "movie" | "series",
      title: contentDetails.title,
      poster: contentDetails.poster,
      backdrop: contentDetails.backdrop || contentDetails.background,
      season: season ? parseInt(season) : undefined,
      episode: episode ? parseInt(episode) : undefined,
      progress: 100,
      duration: Math.round(latestPosRef.current.dur || duration),
      currentTime: Math.round(latestPosRef.current.dur || duration),
    });

    // Remove from continue watching
    const existing = getWatchProgress(
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
    if (existing) removeFromHistory(existing.id);

    // For series: promote the next episode into Continue Watching
    if (type === "series" && season && episode) {
      const currentEpNum = parseInt(episode);
      const currentSeasonNum = parseInt(season);
      const nextEpInSeason = seriesEpisodes.find(
        (e) => e.episodeNumber === currentEpNum + 1,
      );

      if (nextEpInSeason) {
        // Next episode exists in the same season
        updateWatchProgress({
          imdbId: id,
          type: "series",
          title: contentDetails.title,
          poster: contentDetails.poster,
          backdrop: contentDetails.backdrop || contentDetails.background,
          season: currentSeasonNum,
          episode: nextEpInSeason.episodeNumber,
          episodeTitle: nextEpInSeason.name,
          progress: 0,
          duration: 0,
          currentTime: 0,
        });
      } else {
        // No more episodes in this season — try the first episode of the next season
        const nextSeasonNum = currentSeasonNum + 1;
        const hasNextSeason = contentDetails.seasons?.some(
          (s: any) => s.seasonNumber === nextSeasonNum,
        ) || (contentDetails.numberOfSeasons && nextSeasonNum <= contentDetails.numberOfSeasons);

        if (hasNextSeason) {
          cinemetaService.getSeasonEpisodes(id, nextSeasonNum).then((nextEps) => {
            if (nextEps.length > 0) {
              updateWatchProgress({
                imdbId: id,
                type: "series",
                title: contentDetails.title,
                poster: contentDetails.poster,
                backdrop: contentDetails.backdrop || contentDetails.background,
                season: nextSeasonNum,
                episode: nextEps[0].episodeNumber,
                episodeTitle: nextEps[0].name,
                progress: 0,
                duration: 0,
                currentTime: 0,
              });
            }
          }).catch(() => {});
        }
      }
    }

    // Auto-add to library if not already there
    if (!isInLibrary(id)) {
      addToLibrary({
        imdbId: id,
        type: type as "movie" | "series",
        title: contentDetails.title,
        year: contentDetails.year || new Date().getFullYear(),
        poster: contentDetails.poster,
        backdrop: contentDetails.backdrop || contentDetails.background,
        rating: contentDetails.rating,
        genres: contentDetails.genres,
        runtime: type === "movie" ? Number(contentDetails.runtime) || undefined : undefined,
      });
    }

    // Mark as watched in library (only for movies — series require all episodes)
    if (type === "movie") {
      markItemWatched(id);
    }
  };

  // Save progress with all preferences
  // localOnly = true  → saves to localStorage only (via zustand persist), no server sync
  // localOnly = false → saves to localStorage AND triggers debounced server sync
  const saveProgress = (localOnly = false) => {
    // Prefer ref values (always fresh) over state (may be stale in intervals)
    const pos = latestPosRef.current.pos || currentTime;
    const dur = latestPosRef.current.dur || duration;

    if (!contentDetails || !id || dur === 0) return;

    const progress = Math.round((pos / dur) * 100);
    if (progress < 1) return; // Don't save if barely started

    // Auto-mark as finished when reaching ~95%
    if (progress >= 95) {
      markAsFinished();
      return;
    }

    updateWatchProgress(
      {
        imdbId: id,
        type: type as "movie" | "series",
        title: contentDetails.title,
        poster: contentDetails.poster,
        backdrop: contentDetails.backdrop || contentDetails.background,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
        progress,
        duration: Math.round(dur),
        // Save playback preferences for resuming
        currentTime: Math.round(pos),
        subtitleId: useEmbeddedMpv ? (mpvSubtitleId || undefined) : activeSubtitle?.id,
        subtitleOffset: useEmbeddedMpv ? mpvSubtitleOffset : subtitleOffset,
        audioTrackId: useEmbeddedMpv ? (mpvAudioTrackId || undefined) : (activeAudioTrack || undefined),
        torrentInfoHash: undefined,
        torrentTitle: selectedStream?.name ?? selectedStream?.title,
        torrentQuality: undefined,
        torrentProvider: undefined,
        streamUrl: streamUrl || undefined,
      },
      { localOnly },
    );
  };

  // Keep the ref always pointing at the latest version of saveProgress
  saveProgressRef.current = saveProgress;

  useEffect(() => {
    initializePlayer();

    // ── Server sync interval (60 s) ──────────────────────────────────────
    // Local saves happen every 5 s (free / instant).
    // This interval pushes to server every 60 s as a safety-net so
    // cross-device resume is never more than ~1 minute behind.
    serverSyncIntervalRef.current = setInterval(() => {
      saveProgressRef.current(false); // false = server sync
    }, 60_000);

    // ── Visibility-change handler ────────────────────────────────────────
    // Sync to server when the user switches away (alt-tab, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveProgressRef.current(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Save progress to server when leaving the player
      saveProgress();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (serverSyncIntervalRef.current)
        clearInterval(serverSyncIntervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [id, season, episode]);

  useEffect(() => {
    if (!id) return;

    const savedProgress = getWatchProgress(
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );

    setMpvSubtitleId(savedProgress?.subtitleId || null);
    setMpvSubtitleOffset(savedProgress?.subtitleOffset || 0);
    setMpvAudioTrackId(savedProgress?.audioTrackId || null);
  }, [id, season, episode, getWatchProgress]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(
              0,
              videoRef.current.currentTime - 10,
            );
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(
              videoRef.current.duration || 0,
              videoRef.current.currentTime + 10,
            );
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case "KeyM":
          if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
          }
          break;
        case "KeyF":
          if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
          } else {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
          }
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keep playing ref in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    // Hide controls after 3 seconds of inactivity
    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, isPlaying]);

  const waitForVideoMetadata = async () => {
    const video = videoRef.current;
    if (!video || video.readyState >= 1) {
      if (video) {
        setHasEmbeddedSubtitleTracks(video.textTracks.length > 0);
      }
      return;
    }

    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        resolve();
      };

      video.addEventListener("loadedmetadata", done, { once: true });
      video.addEventListener("loadeddata", done, { once: true });

      // Generous timeout for slow streaming connections
      setTimeout(() => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        resolve();
      }, 3000);
    });

    if (videoRef.current) {
      setHasEmbeddedSubtitleTracks(videoRef.current.textTracks.length > 0);
    }
  };

  const initializePlayer = async () => {
    setIsLoading(true);
    setError(null);
    playbackReadyFiredRef.current = false;

    // Pre-initialize MPV in background
    if (playerType === "embedded-mpv") {
      embeddedMpvService.initialize().catch(() => {});
    }

    try {
      const imdbId = id!;
      let details;
      let contentTitle = "";

      if (type === "movie") {
        details = await cinemetaService.getMovieDetails(imdbId);
        contentTitle = `${details.title} (${details.year})`;
      } else {
        details = await cinemetaService.getSeriesDetails(imdbId);
        const seasonNum = parseInt(season || "1");
        const episodeNum = parseInt(episode || "1");
        const episodes = await cinemetaService.getSeasonEpisodes(imdbId, seasonNum);
        setSeriesEpisodes(episodes);
        const currentEpisode = episodes.find((e) => e.episodeNumber === episodeNum);
        contentTitle = `${details.title} - S${seasonNum.toString().padStart(2, "0")}E${episodeNum.toString().padStart(2, "0")}`;
        if (currentEpisode) contentTitle += ` - ${currentEpisode.name}`;
      }

      setTitle(contentTitle);
      setContentDetails(details);

      // Seamless next episode auto-play — resolve streams and auto-select a matching one
      const autoPlayNextState = location.state?.autoPlayNext as boolean | undefined;
      if (autoPlayNextState) {
        // Restore volume/mute from previous episode
        const prevVolume = location.state?.volume as number | undefined;
        const prevMuted = location.state?.muted as boolean | undefined;
        if (prevVolume !== undefined) setVolume(prevVolume);
        if (prevMuted !== undefined) setIsMuted(prevMuted);

        const prevStream = location.state?.previousSelectedStream as { name?: string; title?: string; addonName?: string } | null;

        const contentId =
          type === "movie"
            ? imdbId
            : `${imdbId}:${parseInt(season || "1")}:${parseInt(episode || "1")}`;

        // Track whether we've already picked a stream (closure-safe)
        let streamPicked = false;

        // Query streams and auto-select the best match
        const results = await getStreamsProgressive(type as "movie" | "series", contentId, (partial, pending) => {
          setAddonStreamResults(partial);
          setPendingAddons(pending);

          // Try to auto-select as soon as we get results (don't wait for all addons)
          if (partial.length > 0 && !streamPicked) {
            const allStreams = partial.flatMap((r) => r.streams);
            if (allStreams.length > 0) {
              // Try to match by addon name and stream title pattern
              let bestMatch = allStreams[0];
              if (prevStream) {
                const prevName = (prevStream.name || prevStream.title || "").toLowerCase();
                const match = allStreams.find((s) => {
                  const sName = (s.name || s.title || "").toLowerCase();
                  // Match by addon name first, then similar quality/name
                  if (prevStream.addonName && (s as any).addonName === prevStream.addonName) return true;
                  // Fallback: similar stream name pattern
                  return sName && prevName && sName.includes(prevName.split(" ")[0]);
                });
                if (match) bestMatch = match;
              }
              const matchUrl = bestMatch.url ?? (bestMatch.infoHash ? `magnet:?xt=urn:btih:${bestMatch.infoHash}` : null);
              if (matchUrl) {
                streamPicked = true;
                setSelectedStream(bestMatch);
                loadStream(matchUrl);
              }
            }
          }
        });

        // If we still haven't started playing, pick the first available stream
        if (!streamPicked) {
          setAddonStreamResults(results);
          const allStreams = results.flatMap((r) => r.streams);
          if (allStreams.length > 0) {
            const firstUrl = allStreams[0].url ?? (allStreams[0].infoHash ? `magnet:?xt=urn:btih:${allStreams[0].infoHash}` : null);
            if (firstUrl) {
              setSelectedStream(allStreams[0]);
              await loadStream(firstUrl);
            }
          } else {
            setError("No streams found for next episode.");
            setIsLoading(false);
          }
        }
        return;
      }

      // If a direct stream URL was passed from the details page, play it immediately
      const stateStreamUrl = location.state?.streamUrl as string | undefined;
      if (stateStreamUrl) {
        await loadStream(stateStreamUrl);
        // Load addon streams in background for source switching
        const contentId =
          type === "movie"
            ? imdbId
            : `${imdbId}:${parseInt(season || "1")}:${parseInt(episode || "1")}`;
        getStreamsProgressive(type as "movie" | "series", contentId, (partial, pending) => {
          setAddonStreamResults(partial);
          setPendingAddons(pending);
        })
          .catch(console.error);
        return;
      }

      // No stream passed — query addons and show picker
      const contentId =
        type === "movie"
          ? imdbId
          : `${imdbId}:${parseInt(season || "1")}:${parseInt(episode || "1")}`;

      setShowSourcePicker(true);
      setIsLoading(false);
      setIsLoadingStreams(true);
      const results = await getStreamsProgressive(type as "movie" | "series", contentId, (partial, pending) => {
        setAddonStreamResults(partial);
        setPendingAddons(pending);
      });
      setIsLoadingStreams(false);
      setAddonStreamResults(results);

      const allStreams = results.flatMap((r) => r.streams);
      if (allStreams.length === 0) {
        setShowSourcePicker(false);
        setError("No streams found. Make sure you have addons installed and enabled from the Addons page.");
      }
    } catch (err) {
      console.error("Player initialization failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load content");
      setIsLoading(false);
    }
  };

  const loadStream = async (url: string) => {
    setShowSourcePicker(false);
    setStreamRetryCount(0);
    setStreamUrl(url);
    playbackReadyFiredRef.current = false;

    // Check if we should use embedded MPV
    if (playerType === "embedded-mpv") {
      setUseEmbeddedMpv(true);
      setTimeout(() => {
        if (!playbackReadyFiredRef.current) {
          playbackReadyFiredRef.current = true;
          setIsLoading(false);
        }
      }, 15_000);
      return;
    }

    // Built-in player — load subtitles and autoplay
    loadSubtitles();

    if (autoPlay) {
      setTimeout(() => {
        videoRef.current?.play().catch((err) => {
          console.error("Auto-play failed:", err);
          if (err.name === "NotSupportedError" && streamRetryCount > 0) {
            setUseEmbeddedMpv(true);
          }
        });
      }, 100);
    }

    setTimeout(() => {
      if (!playbackReadyFiredRef.current) {
        playbackReadyFiredRef.current = true;
        setIsLoading(false);
      }
    }, 20_000);
  };

  // Load subtitles from OpenSubtitles
  const loadSubtitles = async () => {
    if (!id) return;

    const { subtitles: subPrefs } = useSettingsStore.getState();

    // Check if auto-load is enabled
    if (!subPrefs.autoLoad) {
      console.log("Subtitle auto-load disabled");
      return;
    }

    setIsLoadingSubtitles(true);
    try {
      // Build language list: primary + secondaries
      const languages = [
        subPrefs.defaultLanguage,
        ...subPrefs.secondaryLanguages,
      ];

      const subs = await openSubtitlesService.search({
        imdbId: id,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
        languages: languages,
      });

      if (subs.length === 0) {
        console.log("No subtitles found for this content");
        setSubtitles([]);
        return;
      }

      setSubtitles(subs);

      await waitForVideoMetadata();

      const hasEmbeddedSubtitleTracks =
        !!videoRef.current?.textTracks &&
        videoRef.current.textTracks.length > 0;

      if (hasEmbeddedSubtitleTracks) {
        console.log(
          "Embedded subtitles detected; prioritizing embedded tracks over addon autoload.",
        );
        return;
      }

      // Check for saved subtitle preference
      const savedProgress = getWatchProgress(
        id,
        season ? parseInt(season) : undefined,
        episode ? parseInt(episode) : undefined,
      );

      // First try to restore previously selected subtitle
      if (savedProgress?.subtitleId) {
        const savedSubtitle = subs.find(
          (s) => s.id === savedProgress.subtitleId,
        );
        if (savedSubtitle) {
          console.log("Restoring saved subtitle:", savedSubtitle.fileName);
          // Restore saved offset
          if (savedProgress.subtitleOffset) {
            setSubtitleOffset(savedProgress.subtitleOffset);
          }
          await handleSubtitleSelect(savedSubtitle, true);
          return;
        }
      }

      // Otherwise, auto-load best rated subtitle (already sorted by rating, 10-star first)
      let bestSubtitle = subs[0];

      // Filter to default language first
      const defaultLangSubs = subs.filter(
        (s) => s.languageCode === subPrefs.defaultLanguage,
      );

      if (defaultLangSubs.length > 0) {
        // Prefer perfect 10-star rating in default language
        const perfectRatingSub = defaultLangSubs.find((s) => s.rating === 10);
        if (perfectRatingSub) {
          bestSubtitle = perfectRatingSub;
        } else {
          // Otherwise take the highest rated in default language
          bestSubtitle = defaultLangSubs[0];
        }

        // Override with hearing impaired if preferred
        if (subPrefs.preferHearingImpaired) {
          const hiSub = defaultLangSubs.find((s) => s.hearing_impaired);
          if (hiSub) {
            bestSubtitle = hiSub;
          }
        }
      }

      // Auto-load the best subtitle
      console.log(
        "Auto-loading best rated subtitle:",
        bestSubtitle.fileName,
        "Rating:",
        bestSubtitle.rating,
      );
      await handleSubtitleSelect(bestSubtitle, true);
    } catch (error) {
      console.error("Failed to load subtitles:", error);
      // Don't show error to user, subtitles are optional
    } finally {
      setIsLoadingSubtitles(false);
    }
  };

  // Handle subtitle selection
  const handleSubtitleSelect = async (
    subtitle: Subtitle | null,
    isAutoLoad: boolean = false,
  ) => {
    // Clean up previous subtitle URL
    if (subtitleUrl) {
      URL.revokeObjectURL(subtitleUrl);
      setSubtitleUrl(null);
    }

    if (!subtitle) {
      setActiveSubtitle(null);
      if (trackRef.current && videoRef.current) {
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }
      return;
    }

    try {
      // Download subtitle content
      const content = await openSubtitlesService.download(subtitle);

      // Apply saved sync offset if exists
      const videoId = `${id}-${season || "0"}-${episode || "0"}`;
      const savedOffset = useSettingsStore.getState().getSyncOffset(videoId);

      let vttContent = createSubtitleBlobUrl(content, subtitle.format);

      // If we have a saved offset, apply it
      if (savedOffset !== 0) {
        const response = await fetch(vttContent);
        const originalVtt = await response.text();
        const adjustedContent = adjustSubtitleTiming(originalVtt, savedOffset);

        URL.revokeObjectURL(vttContent);
        const newBlob = new Blob([adjustedContent], { type: "text/vtt" });
        vttContent = URL.createObjectURL(newBlob);
        setSubtitleOffset(savedOffset);
      }

      setSubtitleUrl(vttContent);
      setActiveSubtitle(subtitle);

      // Keep the native track hidden - we use custom SubtitleOverlay instead
      if (trackRef.current && videoRef.current) {
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }

      if (!isAutoLoad) {
        console.log("Subtitle loaded:", subtitle.fileName);
      }
    } catch (error) {
      console.error("Failed to load subtitle:", error);
    }
  };

  // Handle subtitle timing adjustment
  const handleSubtitleTimingAdjust = async (offsetSeconds: number) => {
    if (!activeSubtitle || !subtitleUrl) return;

    setSubtitleOffset(offsetSeconds);

    // Save offset to settings
    const videoId = `${id}-${season || "0"}-${episode || "0"}`;
    useSettingsStore.getState().setSyncOffset(videoId, offsetSeconds);

    try {
      // Re-download and adjust timing
      const content = await openSubtitlesService.download(activeSubtitle);
      const blobUrl = createSubtitleBlobUrl(content, activeSubtitle.format);

      // Adjust timing
      const response = await fetch(blobUrl);
      const vttContent = await response.text();
      const adjustedContent = adjustSubtitleTiming(vttContent, offsetSeconds);

      // Create new blob URL with adjusted content
      URL.revokeObjectURL(subtitleUrl);
      URL.revokeObjectURL(blobUrl);
      const newBlob = new Blob([adjustedContent], { type: "text/vtt" });
      const newBlobUrl = URL.createObjectURL(newBlob);

      setSubtitleUrl(newBlobUrl);

      // Keep native track hidden - we use custom SubtitleOverlay
      if (trackRef.current && videoRef.current) {
        trackRef.current.src = newBlobUrl;
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }
    } catch (error) {
      console.error("Failed to adjust subtitle timing:", error);
    }
  };

  // Detect and load audio tracks from video element
  const loadAudioTracks = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // Wait for metadata to be loaded
    const handleLoadedMetadata = () => {
      // Check for native HTML5 audioTracks
      if (video.audioTracks && video.audioTracks.length > 0) {
        const tracks: AudioTrack[] = [];

        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          tracks.push({
            id: track.id || i.toString(),
            label: track.label || `Audio Track ${i + 1}`,
            language: track.language || "und",
            kind: track.kind || "main",
            enabled: track.enabled,
          });
        }

        setAudioTracks(tracks);

        // Find active track
        const activeTrack = tracks.find((t) => t.enabled);
        if (activeTrack) {
          setActiveAudioTrack(activeTrack.id);
        }
      }
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
    }
  };

  // Handle audio track selection
  const handleAudioTrackSelect = (trackId: string) => {
    if (!videoRef.current || !videoRef.current.audioTracks) return;

    const video = videoRef.current;
    const audioTracks = video.audioTracks!;

    // Disable all tracks and enable selected one
    for (let i = 0; i < audioTracks.length; i++) {
      const track = audioTracks[i];
      const id = track.id || i.toString();
      track.enabled = id === trackId;
    }

    setActiveAudioTrack(trackId);
    console.log("Audio track switched to:", trackId);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  // Track time updates — local save every 5 seconds, server sync is handled
  // by the 60-second interval + pause/unmount/visibility-change events
  const lastSaveRef = { current: 0 };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const newTime = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 0;
      setCurrentTime(newTime);

      // Keep the position ref fresh for server-sync interval
      latestPosRef.current = { pos: newTime, dur };

      // Local-only save every 5 seconds of playback
      if (Math.floor(newTime) - lastSaveRef.current >= 5) {
        lastSaveRef.current = Math.floor(newTime);
        saveProgress(true); // true = local only
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Skip Intro ──────────────────────────────────────────────────────────
  // Fetch skip segments for series episodes
  useEffect(() => {
    if (type !== "series" || !id || !season || !episode) {
      setSkipSegments([]);
      return;
    }
    skipIntroService
      .getSkipSegments(id, parseInt(season), parseInt(episode))
      .then((segs) => {
        setSkipSegments(segs);
        autoSkippedSegmentsRef.current.clear();
      })
      .catch(() => setSkipSegments([]));
  }, [id, type, season, episode]);

  // Show/hide the skip button based on current playback position + auto-skip
  useEffect(() => {
    if (skipSegments.length === 0) {
      setShowSkipButton(false);
      activeSkipRef.current = null;
      return;
    }
    // Find any segment currently in range (intro, outro, or recap)
    const active = skipSegments.find(
      (s) => currentTime >= s.startTime && currentTime < s.endTime,
    );
    if (active) {
      const segKey = `${active.type}:${active.startTime}`;
      const isIntroType = active.type === "intro" || active.type === "mixed-intro" || active.type === "recap";
      const isOutroType = active.type === "outro" || active.type === "mixed-outro";
      const shouldAutoSkip =
        (isIntroType && skipIntroSetting) || (isOutroType && skipOutroSetting);

      if (shouldAutoSkip && !autoSkippedSegmentsRef.current.has(segKey)) {
        // Auto-skip this segment
        autoSkippedSegmentsRef.current.add(segKey);
        const label = isOutroType ? "outro" : active.type === "recap" ? "recap" : "intro";
        const sourceLabel = active.source === "introdb" ? "IntroDB" : "AniSkip";
        setAutoSkipNotice(`Skipped ${label} · ${sourceLabel}`);
        setTimeout(() => setAutoSkipNotice(null), 3000);
        if (useEmbeddedMpv) {
          embeddedMpvService.seek(active.endTime);
        } else if (videoRef.current) {
          videoRef.current.currentTime = active.endTime;
        }
        setShowSkipButton(false);
        activeSkipRef.current = null;
        return;
      }

      activeSkipRef.current = active;
      setShowSkipButton(true);
    } else {
      activeSkipRef.current = null;
      setShowSkipButton(false);
    }
  }, [currentTime, skipSegments, skipIntroSetting, skipOutroSetting, useEmbeddedMpv]);

  const handleSkipIntro = () => {
    const seg = activeSkipRef.current;
    if (!seg) return;
    if (useEmbeddedMpv) {
      embeddedMpvService.seek(seg.endTime);
      setCurrentTime(seg.endTime);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seg.endTime;
      setCurrentTime(seg.endTime);
    }
    setShowSkipButton(false);
  };

  // ── Next Episode Auto-Play ──────────────────────────────────────────────
  // If an outro segment exists near the end, trigger popup at the outro start.
  // Otherwise, fall back to showing popup 60s before end.
  useEffect(() => {
    if (type !== "series" || !id || !season || !episode || duration === 0) return;

    const remaining = duration - currentTime;

    // Check if there's an outro segment near the end of the video (within last 5 min)
    const outroSeg = skipSegments.find(
      (s) => (s.type === "outro" || s.type === "mixed-outro") && s.startTime >= duration - 300,
    );

    let shouldTrigger = false;
    if (outroSeg) {
      // Trigger when playback enters the outro
      shouldTrigger = currentTime >= outroSeg.startTime && remaining > 0;
    } else {
      // No outro data — fall back to 60s before end
      shouldTrigger = remaining <= 60 && remaining > 0;
    }

    // Hide popup and cancel delay if user seeks away from the trigger zone
    if (!shouldTrigger && (showNextEpisodePopup || nextEpisodeDelayRef.current)) {
      setShowNextEpisodePopup(false);
      setNextEpisodeCountdown(0);
      if (nextEpisodeTimerRef.current) clearInterval(nextEpisodeTimerRef.current);
      if (nextEpisodeDelayRef.current) { clearTimeout(nextEpisodeDelayRef.current); nextEpisodeDelayRef.current = null; }
      return;
    }

    if (!shouldTrigger || nextEpisodeDismissedRef.current || showNextEpisodePopup || nextEpisodeDelayRef.current) return;

    const currentSeason = parseInt(season);
    const currentEp = parseInt(episode);

    // Fetch next episode info, then wait 3s before showing the popup
    cinemetaService.getSeasonEpisodes(id, currentSeason).then((eps) => {
      const nextEp = eps.find((e) => e.episodeNumber === currentEp + 1);
      const showPopup = (info: { season: number; episode: number; title: string; thumbnail?: string }) => {
        nextEpisodeDelayRef.current = setTimeout(() => {
          nextEpisodeDelayRef.current = null;
          setNextEpisodeInfo(info);
          setNextEpisodeCountdown(25);
          setPopupInstance((n) => n + 1);
          setShowNextEpisodePopup(true);
        }, 3000);
      };
      if (nextEp) {
        showPopup({ season: currentSeason, episode: nextEp.episodeNumber, title: nextEp.name, thumbnail: nextEp.thumbnail });
      } else {
        // Try next season
        cinemetaService.getSeriesDetails(id).then((details) => {
          const nextSeasonNum = currentSeason + 1;
          const hasNextSeason = details.seasons?.some((s) => s.seasonNumber === nextSeasonNum) ||
            (details.numberOfSeasons && nextSeasonNum <= details.numberOfSeasons);
          if (hasNextSeason) {
            cinemetaService.getSeasonEpisodes(id, nextSeasonNum).then((nextEps) => {
              if (nextEps.length > 0) {
                showPopup({ season: nextSeasonNum, episode: 1, title: nextEps[0].name, thumbnail: nextEps[0].thumbnail });
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [currentTime, duration, type, id, season, episode, skipSegments, showNextEpisodePopup]);

  /**
   * Play the next episode seamlessly — carry forward stream, volume, subtitle settings.
   * Navigates with the current stream URL in location state so the player picks it up
   * immediately without showing the source picker.
   */
  const playNextEpisodeSeamlessly = useCallback(() => {
    if (!nextEpisodeInfo || !id) return;
    if (nextEpisodeTimerRef.current) clearInterval(nextEpisodeTimerRef.current);

    // Save current playback state to carry forward
    const currentStreamUrl = streamUrl;
    const currentVolume = useEmbeddedMpv ? embeddedMpvService.getState()?.volume : volume;
    const currentMuted = useEmbeddedMpv ? embeddedMpvService.getState()?.muted : isMuted;

    // Mark current episode as finished
    markAsFinished();

    // Navigate to the next episode, passing autoPlayNext flag so the player
    // auto-resolves streams using the same addon/quality preferences
    navigate(
      `/player/series/${id}/${nextEpisodeInfo.season}/${nextEpisodeInfo.episode}`,
      {
        replace: true,
        state: {
          autoPlayNext: true,
          previousContentId: `${id}:${parseInt(season || "1")}:${parseInt(episode || "1")}`,
          previousStreamUrl: currentStreamUrl,
          previousSelectedStream: selectedStream ? {
            name: selectedStream.name,
            title: selectedStream.title,
            addonName: (selectedStream as any).addonName,
          } : null,
          volume: currentVolume,
          muted: currentMuted,
          subtitleId: useEmbeddedMpv ? mpvSubtitleId : activeSubtitle?.id,
          subtitleOffset: useEmbeddedMpv ? mpvSubtitleOffset : subtitleOffset,
          audioTrackId: useEmbeddedMpv ? mpvAudioTrackId : activeAudioTrack,
        },
      },
    );
  }, [nextEpisodeInfo, id, season, episode, streamUrl, selectedStream, volume, isMuted, useEmbeddedMpv, mpvSubtitleId, mpvSubtitleOffset, mpvAudioTrackId, activeSubtitle, subtitleOffset, activeAudioTrack, navigate, markAsFinished]);

  // Keep ref in sync so the timer closure always calls the latest version
  useEffect(() => {
    playNextEpisodeSeamlesslyRef.current = playNextEpisodeSeamlessly;
  }, [playNextEpisodeSeamlessly]);

  // Countdown timer for next episode popup
  useEffect(() => {
    if (!showNextEpisodePopup || !nextEpisodeInfo) return;

    nextEpisodeTimerRef.current = setInterval(() => {
      setNextEpisodeCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(nextEpisodeTimerRef.current!);
          playNextEpisodeSeamlesslyRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (nextEpisodeTimerRef.current) clearInterval(nextEpisodeTimerRef.current);
    };
  }, [showNextEpisodePopup, nextEpisodeInfo]);

  const handleDismissNextEpisode = () => {
    setShowNextEpisodePopup(false);
    nextEpisodeDismissedRef.current = true;
    if (nextEpisodeTimerRef.current) clearInterval(nextEpisodeTimerRef.current);
    if (nextEpisodeDelayRef.current) { clearTimeout(nextEpisodeDelayRef.current); nextEpisodeDelayRef.current = null; }
  };

  // Seamlessly switch to any episode — reuses current stream source, subtitles, volume etc.
  const switchToEpisodeSeamlessly = useCallback((targetSeason: number, targetEpisode: number) => {
    if (!id) return;
    if (nextEpisodeTimerRef.current) clearInterval(nextEpisodeTimerRef.current);
    if (nextEpisodeDelayRef.current) { clearTimeout(nextEpisodeDelayRef.current); nextEpisodeDelayRef.current = null; }

    const currentStreamUrl = streamUrl;
    const currentVolume = useEmbeddedMpv ? embeddedMpvService.getState()?.volume : volume;
    const currentMuted = useEmbeddedMpv ? embeddedMpvService.getState()?.muted : isMuted;

    // Save current progress before switching
    saveProgressRef.current(false);

    navigate(
      `/player/series/${id}/${targetSeason}/${targetEpisode}`,
      {
        replace: true,
        state: {
          autoPlayNext: true,
          previousContentId: `${id}:${parseInt(season || "1")}:${parseInt(episode || "1")}`,
          previousStreamUrl: currentStreamUrl,
          previousSelectedStream: selectedStream ? {
            name: selectedStream.name,
            title: selectedStream.title,
            addonName: (selectedStream as any).addonName,
          } : null,
          volume: currentVolume,
          muted: currentMuted,
          subtitleId: useEmbeddedMpv ? mpvSubtitleId : activeSubtitle?.id,
          subtitleOffset: useEmbeddedMpv ? mpvSubtitleOffset : subtitleOffset,
          audioTrackId: useEmbeddedMpv ? mpvAudioTrackId : activeAudioTrack,
        },
      },
    );
  }, [id, season, episode, streamUrl, selectedStream, volume, isMuted, useEmbeddedMpv, mpvSubtitleId, mpvSubtitleOffset, mpvAudioTrackId, activeSubtitle, subtitleOffset, activeAudioTrack, navigate]);

  const handlePlayNextNow = () => {
    if (!nextEpisodeInfo) return;
    playNextEpisodeSeamlessly();
  };

  const handleBack = () => {
    // Navigate back to the details page instead of going back in history
    if (id && type) {
      navigate(`/details/${type}/${id}`);
    } else {
      navigate("/");
    }
  };

  // Load episodes for a different season in the episode panel
  const handleSeasonChange = async (seasonNum: number) => {
    if (!id) return;
    setEpisodeMenuSeason(seasonNum);
    setIsLoadingEpisodes(true);
    try {
      const episodes = await cinemetaService.getSeasonEpisodes(id, seasonNum);
      setSeriesEpisodes(episodes);
    } catch {
      setSeriesEpisodes([]);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  // Navigate to next episode (for series only)
  const handleNextEpisode = async () => {
    if (type !== "series" || !id || !season || !episode) return;

    const currentSeason = parseInt(season);
    const currentEpisode = parseInt(episode);

    try {
      // Get episodes for current season
      const episodes = await cinemetaService.getSeasonEpisodes(
        id,
        currentSeason,
      );
      const nextEpisodeNum = currentEpisode + 1;

      // Check if there's a next episode in current season
      const nextEp = episodes.find((e) => e.episodeNumber === nextEpisodeNum);

      if (nextEp) {
        navigate(`/player/series/${id}/${currentSeason}/${nextEpisodeNum}`);
      } else {
        const details = await cinemetaService.getSeriesDetails(id);
        const nextSeasonNum = currentSeason + 1;
        const nextSeason = details.seasons?.find(
          (s) => s.seasonNumber === nextSeasonNum,
        );
        if (nextSeason) {
          navigate(`/player/series/${id}/${nextSeasonNum}/1`);
        }
      }
    } catch (err) {
      console.error("Failed to load next episode:", err);
    }
  };

  return (
    <div
      className={`player-page${!showControls && !useEmbeddedMpv ? " cursor-hidden" : ""}`}
      onMouseMove={handleMouseMove}
      style={subtitleStyles}
    >
      {/* Embedded MPV Player - fullscreen when active */}
      {useEmbeddedMpv && streamUrl && (
        <EmbeddedMpvPlayer
          url={streamUrl}
          title={title}
          imdbId={id || undefined}
          season={season ? parseInt(season) : undefined}
          episode={episode ? parseInt(episode) : undefined}
          autoPlay={autoPlay}
          preferredAudioLang={preferredAudioLanguage}
          preferredSubtitleLang={preferredSubtitleLanguage}
          initialPosition={(() => {
            // Check for saved progress
            const saved = getWatchProgress(
              id!,
              season ? parseInt(season) : undefined,
              episode ? parseInt(episode) : undefined,
            );
            return saved?.currentTime;
          })()}
          onClose={() => {
            setUseEmbeddedMpv(false);
            navigate(-1);
          }}
          onEnded={() => {
            markAsFinished();
            // Auto-play next episode seamlessly if available
            if (type === "series" && seriesEpisodes.length > 0) {
              const currentEpNum = parseInt(episode || "1");
              const nextEp = seriesEpisodes.find(
                (e) => e.episodeNumber === currentEpNum + 1,
              );
              if (nextEp) {
                markedFinishedRef.current = false;
                playNextEpisodeSeamlessly();
                return;
              }
            }
            navigate(-1);
          }}
          onProgress={(position, dur) => {
            // Dismiss cinematic loading screen once MPV is actually playing
            // (position > 0 means frames are decoding, or dur > 0 means demux started)
            if (!playbackReadyFiredRef.current && (position > 0 || dur > 0)) {
              playbackReadyFiredRef.current = true;
              setIsLoading(false);
              setShowStreamInfo(true);
              setTimeout(() => setShowStreamInfo(false), 4000);
            }

            // Update state for display
            setCurrentTime(position);
            setDuration(dur);

            // Keep the position ref fresh for server-sync interval
            latestPosRef.current = { pos: position, dur };

            // Local-only save every 5 seconds of playback position
            if (Math.floor(position) - lastMpvLocalSavePos.current >= 5) {
              lastMpvLocalSavePos.current = Math.floor(position);
              if (!contentDetails || !id || dur === 0) return;
              const progress = Math.round((position / dur) * 100);
              if (progress < 1) return;
              // Auto-mark as finished at ~95%
              if (progress >= 95) {
                markAsFinished();
                return;
              }
              updateWatchProgress(
                {
                  imdbId: id,
                  type: type as "movie" | "series",
                  title: contentDetails.title,
                  poster: contentDetails.poster,
                  backdrop: contentDetails.backdrop || contentDetails.background,
                  season: season ? parseInt(season) : undefined,
                  episode: episode ? parseInt(episode) : undefined,
                  progress,
                  duration: Math.round(dur),
                  currentTime: Math.round(position),
                  subtitleId: mpvSubtitleId || undefined,
                  subtitleOffset: mpvSubtitleOffset,
                  audioTrackId: mpvAudioTrackId || undefined,
                  torrentInfoHash: undefined,
                  torrentTitle: selectedStream?.name ?? selectedStream?.title,
                  torrentQuality: undefined,
                  torrentProvider: undefined,
                  streamUrl: streamUrl || undefined,
                },
                { localOnly: true },
              );
            }
          }}
          onError={(err) => {
            console.error("Embedded MPV error:", err);
            setError(err);
            setUseEmbeddedMpv(false);
          }}
          // Episode navigation for series
          isSeries={type === "series"}
          currentEpisode={episode ? parseInt(episode) : undefined}
          episodes={seriesEpisodes.map((ep) => {
            const watchProgress = id
              ? getWatchProgress(id, parseInt(season || "1"), ep.episodeNumber)
              : undefined;
            return {
              id: ep.id,
              episodeNumber: ep.episodeNumber,
              name: ep.name,
              still: ep.still,
              progress: watchProgress?.progress,
            };
          })}
          onEpisodeSelect={(epNum) => {
            switchToEpisodeSeamlessly(episodeMenuSeason, epNum);
          }}
          onNextEpisode={() => {
            const currentEpNum = parseInt(episode || "1");
            const nextEp = seriesEpisodes.find(
              (e) => e.episodeNumber === currentEpNum + 1,
            );
            if (nextEp) {
              switchToEpisodeSeamlessly(parseInt(season || "1"), currentEpNum + 1);
            }
          }}
          blurUnwatched={blurUnwatchedEpisodes}
          seasons={(() => {
            if (contentDetails?.seasons) {
              return contentDetails.seasons
                .map((s: any) => s.seasonNumber)
                .filter((n: number) => n > 0)
                .sort((a: number, b: number) => a - b);
            }
            if (contentDetails?.numberOfSeasons) {
              return Array.from({ length: contentDetails.numberOfSeasons }, (_, i) => i + 1);
            }
            return [parseInt(season || "1")];
          })()}
          currentSeason={episodeMenuSeason}
          onSeasonChange={handleSeasonChange}
          isLoadingEpisodes={isLoadingEpisodes}
          initialSubtitleId={mpvSubtitleId}
          initialSubtitleOffset={mpvSubtitleOffset}
          initialAudioTrackId={mpvAudioTrackId}
          onSubtitleSelectionChange={setMpvSubtitleId}
          onSubtitleOffsetChange={setMpvSubtitleOffset}
          onAudioTrackChange={setMpvAudioTrackId}
          skipSegments={skipSegments}
        />
      )}

      {/* Skip button for MPV player */}
      {useEmbeddedMpv && showSkipButton && activeSkipRef.current && (
        <button className="skip-intro-btn" onClick={handleSkipIntro}>
          <SkipForward size={14} /> Skip {activeSkipRef.current.type === "outro" || activeSkipRef.current.type === "mixed-outro" ? "Outro" : activeSkipRef.current.type === "recap" ? "Recap" : "Intro"}
          <span className="skip-source">· {activeSkipRef.current.source === "introdb" ? "IntroDB" : "AniSkip"}</span>
        </button>
      )}

      {/* Auto-skip notification */}
      {autoSkipNotice && (
        <div className="auto-skip-notice">{autoSkipNotice}</div>
      )}

      {/* Next Episode popup for MPV player */}
      {useEmbeddedMpv && showNextEpisodePopup && nextEpisodeInfo && (
        <div className="next-episode-popup" key={`mpv-next-ep-${popupInstance}`}>
          {nextEpisodeInfo.thumbnail && (
            <div className="next-episode-thumbnail-wrapper">
              <img
                src={nextEpisodeInfo.thumbnail}
                alt=""
                className="next-episode-thumbnail"
                style={blurUnwatchedEpisodes ? { filter: "blur(20px)", transform: "scale(1.1)" } : undefined}
              />
            </div>
          )}
          <div className="next-episode-popup-text">
            <span className="next-episode-label">Up Next in {nextEpisodeCountdown}s</span>
            <span className="next-episode-title">
              S{nextEpisodeInfo.season.toString().padStart(2, "0")}E{nextEpisodeInfo.episode.toString().padStart(2, "0")} — {nextEpisodeInfo.title}
            </span>
          </div>
          <div className="next-episode-popup-actions">
            <button className="next-episode-play-btn" onClick={handlePlayNextNow}>
              <Play size={14} /> Play Now
            </button>
            <button className="next-episode-dismiss-btn" onClick={handleDismissNextEpisode}>
              <X size={14} />
            </button>
          </div>
          <div className="next-episode-countdown-bar">
            <div
              className="next-episode-countdown-fill"
              style={{ animationDuration: "25s" }}
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="player-loading">
          {/* Fluid aurora background */}
          <div className="aurora-container">
            <div className="aurora-blob aurora-blob-1" />
            <div className="aurora-blob aurora-blob-2" />
            <div className="aurora-blob aurora-blob-3" />
            <div className="aurora-blob aurora-blob-4" />
          </div>

          {/* Movie/series poster that breathes in and out through the aurora */}
          {contentDetails?.background || contentDetails?.backdrop ? (
            <div className="aurora-poster-wrap">
              <img
                className="aurora-poster"
                src={contentDetails.background || contentDetails.backdrop}
                alt=""
              />
            </div>
          ) : null}

          {/* Floating light particles */}
          <div className="aurora-particles">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="aurora-particle" style={{
                '--i': i,
                '--x': `${10 + Math.random() * 80}%`,
                '--y': `${10 + Math.random() * 80}%`,
                '--d': `${4 + Math.random() * 6}s`,
                '--s': `${2 + Math.random() * 3}px`,
              } as React.CSSProperties} />
            ))}
          </div>

          {/* Logo / title */}
          <div className="aurora-title-wrap">
            {contentDetails?.logo ? (
              <img
                className="aurora-logo"
                src={contentDetails.logo}
                alt={contentDetails.title || ""}
              />
            ) : (
              <p className="aurora-title">{title || "Loading stream..."}</p>
            )}
            <div className="aurora-loader-bar">
              <div className="aurora-loader-fill" />
            </div>
          </div>
        </div>
      )}

      {/* Stream Info Overlay – shows for both built-in and MPV player */}
      {showStreamInfo && selectedStream && (
        <div className="stream-info-overlay">
          {(() => {
            const streamTitle = selectedStream.name ?? selectedStream.title ?? "";
            const info = parseStreamInfo(streamTitle, selectedStream.description);
            return (
              <div className="stream-info-content">
                <div className="stream-info-badges">
                  <span
                    className={`stream-badge badge-resolution ${info.resolutionBadge === "4K" ? "badge-4k" : ""}`}
                  >
                    {info.resolutionBadge}
                  </span>
                  {info.hasDolbyVision && <DolbyVisionBadge height={24} />}
                  {info.hasHDR10Plus && <HDR10PlusBadge height={24} />}
                  {info.isHDR &&
                    !info.hasDolbyVision &&
                    !info.hasHDR10Plus &&
                    (info.hdrType === "HDR10" ? (
                      <HDR10Badge height={24} />
                    ) : (
                      <HDRBadge height={24} />
                    ))}
                  {info.hasAtmos && <DolbyAtmosBadge height={24} />}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="player-error">
          <span className="error-icon">
            <AlertTriangle size={40} />
          </span>
          <h2>Playback Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button
              className="btn btn-primary"
              onClick={() => setShowSourcePicker(true)}
            >
              Try Another Source
            </button>
            <button className="btn btn-secondary" onClick={handleBack}>
              Go Back
            </button>
          </div>
        </div>
      )}

      {showSourcePicker && (
        <SourceSelectPopup
          title={title}
          streams={addonStreamResults}
          isLoading={isLoadingStreams}
          pendingAddons={pendingAddons}
          onSelectStream={(url) => {
            // Find the matching stream to track selectedStream for info display
            for (const r of addonStreamResults) {
              const match = r.streams.find((s) => {
                const sUrl = s.url ?? (s.infoHash ? `magnet:?xt=urn:btih:${s.infoHash}` : null);
                return sUrl === url;
              });
              if (match) { setSelectedStream(match); break; }
            }
            loadStream(url);
          }}
          onClose={() => {
            setShowSourcePicker(false);
            if (!streamUrl) handleBack();
          }}
        />
      )}

      {streamUrl && !useEmbeddedMpv && (
        <>
          <video
            ref={videoRef}
            className="video-player"
            src={streamUrl}
            onClick={togglePlay}
            onPlay={() => {
              setIsPlaying(true);
              // Dismiss loading screen on play start (backup for onCanPlay)
              if (!playbackReadyFiredRef.current) {
                playbackReadyFiredRef.current = true;
                setIsLoading(false);
                setShowStreamInfo(true);
                setTimeout(() => setShowStreamInfo(false), 4000);
              }
            }}
            onCanPlay={() => {
              // Dismiss loading screen once enough data is buffered to play
              if (!playbackReadyFiredRef.current) {
                playbackReadyFiredRef.current = true;
                setIsLoading(false);
                setShowStreamInfo(true);
                setTimeout(() => setShowStreamInfo(false), 4000);
              }
            }}
            onPause={() => {
              setIsPlaying(false);
              // Sync to server on pause so cross-device resume is accurate
              saveProgress();
            }}
            onError={(e) => {
              const video = e.currentTarget;
              const mediaError = video.error;
              console.error("Video element error:", mediaError?.code, mediaError?.message);

              if (!streamUrl) return;

              if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                // Codec not supported by built-in player → switch to MPV
                console.warn("Format not supported by built-in player, switching to MPV...");
                setUseEmbeddedMpv(true);
              } else {
                setError(`Playback failed. The stream may be unavailable. ${mediaError?.message || ""}`);
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              const videoDuration = videoRef.current?.duration || 0;
              setDuration(videoDuration);
              loadAudioTracks();
              setHasEmbeddedSubtitleTracks(
                (videoRef.current?.textTracks.length || 0) > 0,
              );

              // Resume from saved position
              if (id && videoRef.current) {
                const savedProgress = getWatchProgress(
                  id,
                  season ? parseInt(season) : undefined,
                  episode ? parseInt(episode) : undefined,
                );

                if (
                  savedProgress?.currentTime &&
                  savedProgress.currentTime > 0
                ) {
                  // Don't resume if almost finished (>95%)
                  if (savedProgress.progress < 95) {
                    console.log(
                      "Resuming from",
                      savedProgress.currentTime,
                      "seconds",
                    );
                    videoRef.current.currentTime = savedProgress.currentTime;
                    setCurrentTime(savedProgress.currentTime);
                  }
                }

                // Restore saved audio track
                if (
                  savedProgress?.audioTrackId &&
                  videoRef.current.audioTracks
                ) {
                  for (
                    let i = 0;
                    i < videoRef.current.audioTracks.length;
                    i++
                  ) {
                    const track = videoRef.current.audioTracks[i];
                    const trackId = track.id || i.toString();
                    if (trackId === savedProgress.audioTrackId) {
                      track.enabled = true;
                      setActiveAudioTrack(trackId);
                    } else {
                      track.enabled = false;
                    }
                  }
                }
              }
            }}
            onEnded={() => {
              markAsFinished();
              // Auto-play next episode seamlessly if available
              if (type === "series" && seriesEpisodes.length > 0) {
                const currentEpNum = parseInt(episode || "1");
                const nextEp = seriesEpisodes.find(
                  (e) => e.episodeNumber === currentEpNum + 1,
                );
                if (nextEp) {
                  markedFinishedRef.current = false;
                  playNextEpisodeSeamlessly();
                  return;
                }
              }
            }}
          >
            {/* Subtitle track */}
            {subtitleUrl && (
              <track
                ref={trackRef}
                kind="subtitles"
                src={subtitleUrl}
                srcLang={activeSubtitle?.languageCode || "en"}
                label={activeSubtitle?.language || "Subtitles"}
              />
            )}
          </video>

          {/* Custom Subtitle Overlay with full CSS control */}
          <SubtitleOverlay
            subtitleUrl={subtitleUrl}
            currentTime={currentTime}
            isVisible={!!activeSubtitle}
            fontSize={subtitleAppearance.fontSize ?? 22}
            fontFamily={subtitleAppearance.fontFamily ?? "sans-serif"}
            textColor={subtitleAppearance.textColor ?? "#FFFFFF"}
            backgroundColor={subtitleAppearance.backgroundColor ?? "#000000"}
            backgroundOpacity={subtitleAppearance.backgroundOpacity ?? 0.75}
            textShadow={subtitleAppearance.textShadow ?? false}
            lineHeight={subtitleAppearance.lineHeight ?? 1.4}
            bottomPosition={subtitleAppearance.bottomPosition ?? 10}
          />

          {/* Skip button overlay — works for intro, outro, and recap */}
          {showSkipButton && activeSkipRef.current && (
            <button
              className="skip-intro-btn"
              onClick={handleSkipIntro}
            >
              <SkipForward size={14} /> Skip {activeSkipRef.current.type === "outro" || activeSkipRef.current.type === "mixed-outro" ? "Outro" : activeSkipRef.current.type === "recap" ? "Recap" : "Intro"}
              <span className="skip-source">· {activeSkipRef.current.source === "introdb" ? "IntroDB" : "AniSkip"}</span>
            </button>
          )}

          {/* Auto-skip notification */}
          {autoSkipNotice && (
            <div className="auto-skip-notice">{autoSkipNotice}</div>
          )}

          {/* Next Episode auto-play popup */}
          {showNextEpisodePopup && nextEpisodeInfo && (
            <div className="next-episode-popup" key={`html5-next-ep-${popupInstance}`}>
              {nextEpisodeInfo.thumbnail && (
                <div className="next-episode-thumbnail-wrapper">
                  <img
                    src={nextEpisodeInfo.thumbnail}
                    alt=""
                    className="next-episode-thumbnail"
                    style={blurUnwatchedEpisodes ? { filter: "blur(20px)", transform: "scale(1.1)" } : undefined}
                  />
                </div>
              )}
              <div className="next-episode-popup-text">
                <span className="next-episode-label">Up Next in {nextEpisodeCountdown}s</span>
                <span className="next-episode-title">
                  S{nextEpisodeInfo.season.toString().padStart(2, "0")}E{nextEpisodeInfo.episode.toString().padStart(2, "0")} — {nextEpisodeInfo.title}
                </span>
              </div>
              <div className="next-episode-popup-actions">
                <button className="next-episode-play-btn" onClick={handlePlayNextNow}>
                  <Play size={14} /> Play Now
                </button>
                <button className="next-episode-dismiss-btn" onClick={handleDismissNextEpisode}>
                  <X size={14} />
                </button>
              </div>
              <div className="next-episode-countdown-bar">
                <div
                  className="next-episode-countdown-fill"
                  style={{ animationDuration: "25s" }}
                />
              </div>
            </div>
          )}

          <div
            className={`player-controls ${showControls ? "visible" : ""}`}
            onClick={(e) => {
              // Only toggle play if clicking directly on the controls overlay, not on buttons/controls
              if (e.target === e.currentTarget) {
                togglePlay();
              }
            }}
          >
            <div className="controls-top">
              <button className="back-btn" onClick={handleBack}>
                <ArrowLeft size={16} /> Back
              </button>
              <span className="player-title">{title}</span>
              <div className="controls-top-right">
                {duration > 0 && currentTime < duration && (
                  <div className="player-clock-info">
                    <span className="player-clock-now">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="player-clock-ends">
                      ends at{" "}
                      {new Date(
                        Date.now() + (duration - currentTime) * 1000,
                      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
                {/* Episode menu button for series only */}
                {type === "series" && (
                  <button
                    className="episodes-btn"
                    onClick={() => setShowEpisodeMenu(true)}
                  >
                    Episodes
                  </button>
                )}
              </div>
            </div>

            {/* Clickable middle area for play/pause */}
            <div className="controls-middle" onClick={togglePlay} />

            <div className="controls-bottom">
              <div className="progress-bar">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="progress-slider"
                />
                <div
                  className="progress-fill"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                {/* Skip segment markers */}
                {duration > 0 && skipSegments.map((seg, i) => (
                  <div
                    key={i}
                    className={`progress-segment-marker progress-segment-marker--${seg.type === "outro" || seg.type === "mixed-outro" ? "outro" : seg.type === "recap" ? "recap" : "intro"}`}
                    style={{
                      left: `${(seg.startTime / duration) * 100}%`,
                      width: `${((seg.endTime - seg.startTime) / duration) * 100}%`,
                    }}
                  />
                ))}
              </div>

              <div className="controls-row">
                <div className="controls-left">
                  <button className="control-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>

                  <div className="volume-control">
                    <button className="control-btn" onClick={toggleMute}>
                      {isMuted || volume === 0 ? (
                        <VolumeX size={20} />
                      ) : volume < 0.5 ? (
                        <Volume1 size={20} />
                      ) : (
                        <Volume2 size={20} />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="volume-slider"
                    />
                  </div>

                  <div className="time-display">
                    <span className="time-display-clock">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                </div>

                <div className="controls-right">
                  {/* Next episode button (series only) */}
                  {type === "series" && (
                    <button
                      className="control-btn next-episode-btn"
                      onClick={handleNextEpisode}
                      title="Next Episode"
                    >
                      <SkipForward size={20} />
                    </button>
                  )}

                  {/* Audio track selector */}
                  {audioTracks.length > 1 && (
                    <AudioTrackSelector
                      tracks={audioTracks}
                      activeTrackId={activeAudioTrack}
                      onSelect={handleAudioTrackSelect}
                    />
                  )}

                  {/* Subtitle selector */}
                  {isLoadingSubtitles && (
                    <span className="subtitle-loading">
                      <span className="subtitle-loading-spinner" />
                    </span>
                  )}
                  {!isLoadingSubtitles &&
                    (subtitles.length > 0 || hasEmbeddedSubtitleTracks) && (
                      <SubtitleSelector
                        subtitles={subtitles}
                        activeSubtitleId={activeSubtitle?.id || null}
                        activeSource={
                          activeSubtitle
                            ? "addon"
                            : hasEmbeddedSubtitleTracks
                              ? "embedded"
                              : null
                        }
                        onSelect={handleSubtitleSelect}
                        onTimingAdjust={handleSubtitleTimingAdjust}
                        currentOffset={subtitleOffset}
                      />
                    )}

                  <button className="control-btn" onClick={toggleFullscreen}>
                    {isFullscreen ? (
                      <Minimize size={20} />
                    ) : (
                      <Maximize size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Episode Slide Menu */}
          {showEpisodeMenu && type === "series" && (
            <div
              className="episode-menu-overlay"
              onClick={() => setShowEpisodeMenu(false)}
            >
              <div
                className="episode-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="episode-menu-header">
                  <select
                    className="season-selector"
                    value={episodeMenuSeason}
                    onChange={(e) => handleSeasonChange(parseInt(e.target.value))}
                  >
                    {(() => {
                      const seasons = contentDetails?.seasons
                        ? contentDetails.seasons
                            .map((s: any) => s.seasonNumber)
                            .filter((n: number) => n > 0)
                            .sort((a: number, b: number) => a - b)
                        : contentDetails?.numberOfSeasons
                          ? Array.from({ length: contentDetails.numberOfSeasons }, (_, i) => i + 1)
                          : [parseInt(season || "1")];
                      return seasons.map((s: number) => (
                        <option key={s} value={s}>Season {s}</option>
                      ));
                    })()}
                  </select>
                  <button
                    className="close-btn"
                    onClick={() => setShowEpisodeMenu(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="episode-menu-list">
                  {isLoadingEpisodes ? (
                    <div className="episode-menu-loading">Loading episodes...</div>
                  ) : (
                  seriesEpisodes.map((ep) => {
                    const isCurrentEpisode =
                      episodeMenuSeason === parseInt(season || "1") &&
                      ep.episodeNumber === parseInt(episode || "1");
                    const watchProgress = id
                      ? getWatchProgress(
                          id,
                          episodeMenuSeason,
                          ep.episodeNumber,
                        )
                      : undefined;
                    // Episode is considered watched if it has any progress (including finished episodes)
                    const isWatched =
                      watchProgress && watchProgress.progress > 0;
                    const shouldBlur =
                      blurUnwatchedEpisodes && !isWatched && ep.still;

                    return (
                      <div
                        key={ep.id}
                        className={`episode-menu-item ${isCurrentEpisode ? "current" : ""}`}
                        onClick={() => {
                          if (!isCurrentEpisode) {
                            switchToEpisodeSeamlessly(episodeMenuSeason, ep.episodeNumber);
                            setShowEpisodeMenu(false);
                          }
                        }}
                      >
                        <div
                          className={`episode-menu-thumbnail ${shouldBlur ? "blur" : ""}`}
                        >
                          {ep.still ? (
                            <img src={ep.still} alt={ep.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="episode-placeholder">
                              <Tv size={28} />
                            </div>
                          )}
                          {isCurrentEpisode && (
                            <div className="now-playing">
                              <Play size={14} /> Now Playing
                            </div>
                          )}
                          {watchProgress &&
                            watchProgress.progress > 0 &&
                            !isCurrentEpisode && (
                              <div className="episode-progress">
                                <div
                                  className="episode-progress-fill"
                                  style={{
                                    width: `${watchProgress.progress}%`,
                                  }}
                                />
                              </div>
                            )}
                        </div>
                        <div className="episode-menu-info">
                          <span className="episode-num">
                            E{ep.episodeNumber}
                          </span>
                          <span className="episode-title">{ep.name}</span>
                        </div>
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
