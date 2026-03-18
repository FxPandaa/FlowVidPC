import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type VideoQuality = "4k" | "1080p" | "720p" | "480p" | "auto";
export type Theme = "dark" | "light" | "system";
export type PlayerType = "default" | "embedded-mpv";
export type StreamSortMode = "quality" | "addon";

export interface SubtitlePreferences {
  autoLoad: boolean;
  defaultLanguage: string;
  secondaryLanguages: string[];
  preferHearingImpaired: boolean;
  syncOffsets: Record<string, number>;
}

/** Describes the user's playback choices for a series so they can be restored on the next episode / CW resume. */
export interface SeriesSubtitlePref {
  type: "embedded" | "online";
  lang: string | null;
  title: string | null;
  codec: string | null;
  /** Index among tracks with same lang+title+codec (disambiguates e.g. 2nd English track) */
  trackIndex?: number;
  onlineSubLang?: string;
  audioLang?: string | null;
  audioTitle?: string | null;
}

export interface SubtitleAppearance {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textShadow: boolean;
  lineHeight: number;
  bottomPosition: number;
}

interface SettingsState {
  preferredQuality: VideoQuality;
  autoPlay: boolean;
  autoPlayNext: boolean;
  skipIntro: boolean;
  skipOutro: boolean;
  playerType: PlayerType;
  preferredAudioLanguage: string;
  preferredSubtitleLanguage: string;
  theme: Theme;
  showWatchedIndicator: boolean;
  showRatings: boolean;
  showForYou: boolean;
  subtitles: SubtitlePreferences;
  subtitleAppearance: SubtitleAppearance;
  blurUnwatchedEpisodes: boolean;
  streamSorting: StreamSortMode;
  tmdbCustomApiKey: string;
  tmdbUseCustomKey: boolean;

  setStreamSorting: (mode: StreamSortMode) => void;
  setPreferredQuality: (quality: VideoQuality) => void;
  setAutoPlay: (enabled: boolean) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setSkipIntro: (enabled: boolean) => void;
  setSkipOutro: (enabled: boolean) => void;
  setPlayerType: (playerType: PlayerType) => void;
  setPreferredAudioLanguage: (lang: string) => void;
  setPreferredSubtitleLanguage: (lang: string) => void;
  setTheme: (theme: Theme) => void;
  setShowWatchedIndicator: (show: boolean) => void;
  setShowRatings: (show: boolean) => void;
  setShowForYou: (show: boolean) => void;
  setSubtitleAutoLoad: (enabled: boolean) => void;
  setSubtitleLanguage: (language: string) => void;
  setSecondaryLanguages: (languages: string[]) => void;
  setPreferHearingImpaired: (enabled: boolean) => void;
  setSyncOffset: (videoId: string, offset: number) => void;
  getSyncOffset: (videoId: string) => number;
  setSubtitleAppearance: (appearance: Partial<SubtitleAppearance>) => void;
  setBlurUnwatchedEpisodes: (enabled: boolean) => void;
  setTmdbCustomApiKey: (key: string) => void;
  setTmdbUseCustomKey: (enabled: boolean) => void;
  clearTmdbCache: () => void;
  seriesSubtitleSelections: Record<string, SeriesSubtitlePref>;
  setSeriesSubtitleSelection: (seriesId: string, pref: SeriesSubtitlePref) => void;
  getSeriesSubtitleSelection: (seriesId: string) => SeriesSubtitlePref | null;
  clearSeriesSubtitleSelection: (seriesId: string) => void;
  resetSettings: () => void;
  syncWithServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
}

const defaultSubtitleAppearance: SubtitleAppearance = {
  fontSize: 28,
  fontFamily: "sans-serif",
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.6,
  textShadow: true,
  lineHeight: 1.5,
  bottomPosition: 8,
};

const defaultSettings = {
  preferredQuality: "1080p" as VideoQuality,
  autoPlay: true,
  autoPlayNext: true,
  skipIntro: false,
  skipOutro: false,
  playerType: "embedded-mpv" as PlayerType,
  preferredAudioLanguage: "eng",
  preferredSubtitleLanguage: "eng",
  theme: "dark" as Theme,
  showWatchedIndicator: true,
  showRatings: true,
  showForYou: true,
  subtitles: {
    autoLoad: true,
    defaultLanguage: "eng",
    secondaryLanguages: ["nld"],
    preferHearingImpaired: false,
    syncOffsets: {},
  },
  subtitleAppearance: defaultSubtitleAppearance,
  blurUnwatchedEpisodes: true,
  streamSorting: "quality" as StreamSortMode,
  tmdbCustomApiKey: "",
  tmdbUseCustomKey: false,
  seriesSubtitleSelections: {} as Record<string, SeriesSubtitlePref>,
};

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSync = (syncFn: () => Promise<void>) => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => { syncFn(); }, 2000);
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setPreferredQuality: (quality) => set({ preferredQuality: quality }),
      setAutoPlay: (enabled) => set({ autoPlay: enabled }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),
      setSkipIntro: (enabled) => set({ skipIntro: enabled }),
      setSkipOutro: (enabled) => set({ skipOutro: enabled }),
      setPlayerType: (playerType) => set({ playerType }),
      setPreferredAudioLanguage: (lang) => set({ preferredAudioLanguage: lang }),
      setPreferredSubtitleLanguage: (lang) => set({ preferredSubtitleLanguage: lang }),
      setTheme: (theme) => set({ theme }),
      setShowWatchedIndicator: (show) => set({ showWatchedIndicator: show }),
      setShowRatings: (show) => set({ showRatings: show }),
      setShowForYou: (show) => set({ showForYou: show }),

      setSubtitleAutoLoad: (enabled) =>
        set((state) => ({ subtitles: { ...state.subtitles, autoLoad: enabled } })),
      setSubtitleLanguage: (language) =>
        set((state) => ({ subtitles: { ...state.subtitles, defaultLanguage: language } })),
      setSecondaryLanguages: (languages) =>
        set((state) => ({ subtitles: { ...state.subtitles, secondaryLanguages: languages } })),
      setPreferHearingImpaired: (enabled) =>
        set((state) => ({ subtitles: { ...state.subtitles, preferHearingImpaired: enabled } })),
      setSyncOffset: (videoId, offset) =>
        set((state) => ({
          subtitles: {
            ...state.subtitles,
            syncOffsets: { ...state.subtitles.syncOffsets, [videoId]: offset },
          },
        })),
      getSyncOffset: (videoId) => get().subtitles.syncOffsets[videoId] || 0,
      setSubtitleAppearance: (appearance) =>
        set((state) => ({
          subtitleAppearance: { ...state.subtitleAppearance, ...appearance },
        })),

      setBlurUnwatchedEpisodes: (enabled) => set({ blurUnwatchedEpisodes: enabled }),
      setStreamSorting: (mode) => set({ streamSorting: mode }),
      setTmdbCustomApiKey: (key) => set({ tmdbCustomApiKey: key }),
      setTmdbUseCustomKey: (enabled) => set({ tmdbUseCustomKey: enabled }),
      seriesSubtitleSelections: {},
      setSeriesSubtitleSelection: (seriesId, pref) =>
        set((state) => ({
          seriesSubtitleSelections: { ...state.seriesSubtitleSelections, [seriesId]: pref },
        })),
      getSeriesSubtitleSelection: (seriesId) => get().seriesSubtitleSelections[seriesId] || null,
      clearSeriesSubtitleSelection: (seriesId) =>
        set((state) => {
          const { [seriesId]: _, ...rest } = state.seriesSubtitleSelections;
          return { seriesSubtitleSelections: rest };
        }),
      clearTmdbCache: () => {
        import("../services/metadata/tmdb").then(({ tmdbService }) => {
          tmdbService.clearCache();
        });
      },

      resetSettings: () => {
        set(defaultSettings);
        debouncedSync(() => get().syncWithServer());
      },

      syncWithServer: async () => {
        const { useAuthStore } = await import("./authStore");
        const { useProfileStore } = await import("./profileStore");
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const state = get();
        const profileId = useProfileStore.getState().activeProfileId;
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

        try {
          await fetch(`${API_URL}/sync/settings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authState.token}`,
            },
            body: JSON.stringify({
              profileId,
              settings: {
                preferredQuality: state.preferredQuality,
                autoPlay: state.autoPlay,
                autoPlayNext: state.autoPlayNext,
                skipIntro: state.skipIntro,
                skipOutro: state.skipOutro,
                theme: state.theme,
                showWatchedIndicator: state.showWatchedIndicator,
                showRatings: state.showRatings,
                subtitles: state.subtitles,
                blurUnwatchedEpisodes: state.blurUnwatchedEpisodes,
                subtitleAppearance: state.subtitleAppearance,
              },
            }),
          });
        } catch (error) {
          if (
            error instanceof TypeError &&
            (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))
          )
            return;
          console.error("Failed to sync settings with server:", error);
        }
      },

      loadFromServer: async () => {
        const { useAuthStore } = await import("./authStore");
        const { useProfileStore } = await import("./profileStore");
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const profileId = useProfileStore.getState().activeProfileId;
        const profileQuery = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

        try {
          const res = await fetch(`${API_URL}/sync/settings${profileQuery}`, {
            headers: { Authorization: `Bearer ${authState.token}` },
          });
          if (res.ok) {
            const { settings } = await res.json();
            if (settings && Object.keys(settings).length > 0) {
              set(settings);
            }
          }
        } catch (error) {
          if (
            error instanceof TypeError &&
            (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))
          )
            return;
          console.error("Failed to load settings from server:", error);
        }
      },
    }),
    {
      name: "FlowVid-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
