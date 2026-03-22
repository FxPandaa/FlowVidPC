import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuthStore } from "./authStore";
import { useSettingsStore } from "./settingsStore";
import { platformFetch } from "../utils/platform";

const CINEMETA_BASE = "https://v3-cinemeta.strem.io";

/** Fetch basic metadata (title, poster, backdrop) from Cinemeta for a single IMDB ID. */
async function fetchCinemetaMeta(imdbId: string, type: "movie" | "series"): Promise<{
  title: string;
  poster?: string;
  backdrop?: string;
  year?: number;
} | null> {
  try {
    const res = await fetch(`${CINEMETA_BASE}/meta/${type}/${imdbId}.json`);
    if (!res.ok) return null;
    const { meta } = await res.json();
    if (!meta) return null;
    return {
      title: meta.name || meta.title || "",
      poster: meta.poster,
      backdrop: meta.background,
      year: meta.year || (meta.releaseInfo ? parseInt(meta.releaseInfo) || undefined : undefined),
    };
  } catch {
    return null;
  }
}

export interface LibraryItem {
  id: string;
  imdbId: string;
  tmdbId?: number;
  type: "movie" | "series";
  title: string;
  year: number;
  poster?: string;
  backdrop?: string;
  rating?: number;
  addedAt: string;
  // New fields
  genres?: string[];
  runtime?: number;
  isFavorite?: boolean;
  watchlist?: boolean;
  userRating?: number; // 1-10
  notes?: string;
  tags?: string[];
  watched?: boolean;
}

export interface WatchHistoryItem {
  id: string;
  imdbId: string;
  type: "movie" | "series";
  title: string;
  poster?: string;
  backdrop?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  progress: number; // 0-100
  duration: number; // in seconds
  watchedAt: string;
  // Saved playback preferences
  currentTime?: number; // Resume position in seconds
  subtitleId?: string; // Selected subtitle ID
  subtitleOffset?: number; // Subtitle sync offset
  audioTrackId?: string; // Selected audio track ID
  // Saved torrent source
  torrentInfoHash?: string; // Torrent info hash to restore same source
  torrentTitle?: string; // Torrent title for reference
  torrentQuality?: string; // Quality (1080p, 720p, etc)
  torrentProvider?: string; // Source provider label
  // Last used stream URL — enables seamless resume from Continue Watching
  streamUrl?: string;
}



export type LibraryFilter =
  | "all"
  | "movies"
  | "series"
  | "favorites"
  | "watchlist";
export type LibrarySortBy = "recent" | "title" | "year" | "rating" | "runtime";

interface ProfileLibraryData {
  library: LibraryItem[];
  watchHistory: WatchHistoryItem[];
}

interface LibraryState {
  // Active profile's data (what consumers read/write)
  library: LibraryItem[];
  watchHistory: WatchHistoryItem[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;

  // Per-profile storage
  profileData: Record<string, ProfileLibraryData>;
  currentProfileId: string | null;

  // Profile switching
  switchProfile: (profileId: string | null) => void;

  // Filter/Sort state
  activeFilter: LibraryFilter;
  sortBy: LibrarySortBy;
  searchQuery: string;

  // Actions
  addToLibrary: (item: Omit<LibraryItem, "id" | "addedAt">) => void;
  removeFromLibrary: (imdbId: string) => void;
  isInLibrary: (imdbId: string) => boolean;
  toggleFavorite: (imdbId: string) => void;
  toggleWatchlist: (imdbId: string) => void;
  markItemWatched: (imdbId: string) => void;
  setUserRating: (imdbId: string, rating: number) => void;
  updateNotes: (imdbId: string, notes: string) => void;
  addTag: (imdbId: string, tag: string) => void;
  removeTag: (imdbId: string, tag: string) => void;

  updateWatchProgress: (
    item: Omit<WatchHistoryItem, "id" | "watchedAt">,
    options?: { localOnly?: boolean },
  ) => void;
  getWatchProgress: (
    imdbId: string,
    season?: number,
    episode?: number,
  ) => WatchHistoryItem | undefined;
  clearWatchHistory: () => void;
  removeFromHistory: (id: string) => void;

  // Filter/Sort
  setFilter: (filter: LibraryFilter) => void;
  setSortBy: (sortBy: LibrarySortBy) => void;
  setSearchQuery: (query: string) => void;
  getFilteredLibrary: () => LibraryItem[];

  syncWithServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  backfillMissingMetadata: () => Promise<void>;
}

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

// Debounce timer for sync — prevents firing 3 full-sync POST requests on every button click
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced sync (2s). Calling again within the window resets the timer. */
function debouncedSync(syncFn: () => Promise<void>): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    syncFn();
  }, 2000);
}

/** Immediately flush any pending debounced sync (e.g. before app close). */
export function flushPendingSync(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
    useLibraryStore.getState().syncWithServer();
  }
}

/** Merge two watch-history lists, keeping the newest version of each unique item. */
function mergeWatchHistory(
  local: WatchHistoryItem[],
  server: WatchHistoryItem[],
): WatchHistoryItem[] {
  const map = new Map<string, WatchHistoryItem>();

  const key = (item: WatchHistoryItem) =>
    `${item.imdbId}:${item.season ?? ""}:${item.episode ?? ""}`;

  for (const item of local) {
    map.set(key(item), item);
  }

  for (const item of server) {
    const k = key(item);
    const existing = map.get(k);
    if (
      !existing ||
      new Date(item.watchedAt).getTime() > new Date(existing.watchedAt).getTime()
    ) {
      map.set(k, item);
    }
  }

  return Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime(),
    )
    .slice(0, 100);
}

/** Merge two library lists, keeping the newest version of each unique item. */
function mergeLibrary(
  local: LibraryItem[],
  server: LibraryItem[],
): LibraryItem[] {
  const map = new Map<string, LibraryItem>();

  for (const item of local) {
    map.set(item.imdbId, item);
  }

  for (const item of server) {
    const existing = map.get(item.imdbId);
    if (
      !existing ||
      new Date(item.addedAt).getTime() > new Date(existing.addedAt).getTime()
    ) {
      map.set(item.imdbId, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
  );
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      library: [],
      watchHistory: [],
      isLoading: false,
      isSyncing: false,
      lastSyncAt: null,
      activeFilter: "all",
      sortBy: "recent",
      searchQuery: "",
      profileData: {},
      currentProfileId: null,

      switchProfile: (profileId: string | null) => {
        const state = get();
        const prevId = state.currentProfileId;

        // Save current data to previous profile (if any)
        if (prevId) {
          const currentData: ProfileLibraryData = {
            library: state.library,
            watchHistory: state.watchHistory,
          };

          set((s) => ({
            profileData: {
              ...s.profileData,
              [prevId]: currentData,
            },
          }));
        }

        // Load data for new profile (or empty if first time)
        const newData = profileId
          ? state.profileData[profileId] || {
              library: [],
              watchHistory: [],
            }
          : { library: [], watchHistory: [] };

        set({
          currentProfileId: profileId,
          library: newData.library,
          watchHistory: newData.watchHistory,
          activeFilter: "all",
          sortBy: "recent",
          searchQuery: "",
        });

        // If this profile has no local cache, fetch from server
        if (profileId && !state.profileData[profileId]) {
          get().loadFromServer();
        }
      },

      addToLibrary: (item) => {
        const newItem: LibraryItem = {
          ...item,
          year: typeof item.year === "string" ? parseInt(item.year, 10) || 0 : item.year,
          rating: typeof item.rating === "string" ? parseFloat(item.rating) || undefined : item.rating,
          runtime: typeof item.runtime === "string" ? parseInt(item.runtime, 10) || undefined : item.runtime,
          id: crypto.randomUUID(),
          addedAt: new Date().toISOString(),
          isFavorite: false,
          watchlist: false,
          tags: [],
        };

        set((state) => ({
          library: [newItem, ...state.library],
        }));

        // Sync in background
        debouncedSync(() => get().syncWithServer());
      },

      removeFromLibrary: (imdbId: string) => {
        set((state) => ({
          library: state.library.filter((item) => item.imdbId !== imdbId),
        }));

        // Clean up series playback preferences
        useSettingsStore.getState().clearSeriesSubtitleSelection(imdbId);

        // Sync in background
        debouncedSync(() => get().syncWithServer());
      },

      isInLibrary: (imdbId: string) => {
        return get().library.some((item) => item.imdbId === imdbId);
      },

      toggleFavorite: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, isFavorite: !item.isFavorite }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      toggleWatchlist: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, watchlist: !item.watchlist }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      markItemWatched: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, watched: true }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      setUserRating: (imdbId: string, rating: number) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, userRating: Math.max(1, Math.min(10, rating)) }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      updateNotes: (imdbId: string, notes: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId ? { ...item, notes } : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      addTag: (imdbId: string, tag: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, tags: [...(item.tags || []), tag] }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      removeTag: (imdbId: string, tag: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, tags: (item.tags || []).filter((t) => t !== tag) }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      updateWatchProgress: (item, options) => {
        const newItem: WatchHistoryItem = {
          ...item,
          id: crypto.randomUUID(),
          watchedAt: new Date().toISOString(),
        };

        set((state) => {
          // Remove existing entry for the same specific content
          // For series: only remove the entry for this specific episode
          // For movies: remove the existing movie entry
          const filtered = state.watchHistory.filter((h) => {
            if (h.imdbId !== item.imdbId) return true;
            if (item.type === "series") {
              // For series, only remove if it's the same episode
              return h.season !== item.season || h.episode !== item.episode;
            }
            // For movies, remove the existing entry
            return false;
          });

          return {
            watchHistory: [newItem, ...filtered].slice(0, 100), // Keep last 100
          };
        });

        // Only sync to server when not local-only (localStorage is updated
        // automatically by zustand persist middleware on every state change)
        if (!options?.localOnly) {
          debouncedSync(() => get().syncWithServer());
        }
      },

      getWatchProgress: (imdbId: string, season?: number, episode?: number) => {
        return get().watchHistory.find((h) => {
          if (h.imdbId !== imdbId) return false;
          if (season !== undefined && episode !== undefined) {
            return h.season === season && h.episode === episode;
          }
          return true;
        });
      },

      clearWatchHistory: () => {
        set({ watchHistory: [] });
        debouncedSync(() => get().syncWithServer());
      },

      removeFromHistory: (id: string) => {
        const state = get();
        const removed = state.watchHistory.find((item) => item.id === id);
        set((state) => ({
          watchHistory: state.watchHistory.filter((item) => item.id !== id),
        }));

        // If this was the last CW entry for a series, clean up its playback prefs
        if (removed?.type === "series") {
          const remaining = get().watchHistory.filter(
            (item) => item.imdbId === removed.imdbId,
          );
          if (remaining.length === 0) {
            useSettingsStore.getState().clearSeriesSubtitleSelection(removed.imdbId);
          }
        }

        debouncedSync(() => get().syncWithServer());
      },

      // Filter/Sort
      setFilter: (filter: LibraryFilter) => {
        set({ activeFilter: filter });
      },

      setSortBy: (sortBy: LibrarySortBy) => {
        set({ sortBy });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      getFilteredLibrary: () => {
        const { library, activeFilter, sortBy, searchQuery } = get();
        let filtered = [...library];

        // Apply filter
        switch (activeFilter) {
          case "movies":
            filtered = filtered.filter((item) => item.type === "movie");
            break;
          case "series":
            filtered = filtered.filter((item) => item.type === "series");
            break;
          case "favorites":
            filtered = filtered.filter((item) => item.isFavorite);
            break;
          case "watchlist":
            filtered = filtered.filter((item) => item.watchlist);
            break;
          case "all":
          default:
            break;
        }

        // Apply search
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (item) =>
              item.title.toLowerCase().includes(query) ||
              item.genres?.some((g) => g.toLowerCase().includes(query)) ||
              item.tags?.some((t) => t.toLowerCase().includes(query)),
          );
        }

        // Apply sort
        switch (sortBy) {
          case "recent":
            filtered.sort(
              (a, b) =>
                new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
            );
            break;
          case "title":
            filtered.sort((a, b) => a.title.localeCompare(b.title));
            break;
          case "rating":
            filtered.sort((a, b) => {
              const ratingA = a.userRating || a.rating || 0;
              const ratingB = b.userRating || b.rating || 0;
              return ratingB - ratingA;
            });
            break;
          case "year":
            filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
            break;
          case "runtime":
            filtered.sort((a, b) => (b.runtime || 0) - (a.runtime || 0));
            break;
        }

        return filtered;
      },

      syncWithServer: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const state = get();
        if (state.isSyncing) return;

        set({ isSyncing: true });

        const profileId = state.currentProfileId;

        try {
          console.log(`[sync] Syncing library (${state.library.length} items) and history (${state.watchHistory.length} items) to ${API_URL}`);

          // Coerce types for items that may have string values from Cinemeta
          const cleanLibrary = state.library.map((item) => ({
            ...item,
            year: typeof item.year === "string" ? parseInt(item.year, 10) || 0 : item.year,
            rating: typeof item.rating === "string" ? parseFloat(String(item.rating)) || undefined : item.rating,
            runtime: typeof item.runtime === "string" ? parseInt(String(item.runtime), 10) || undefined : item.runtime,
          }));

          const [libRes, histRes] = await Promise.all([
            platformFetch(`${API_URL}/sync/library`, {
              method: "POST",
              keepalive: true,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
              body: JSON.stringify({ profileId, library: cleanLibrary }),
            }),
            platformFetch(`${API_URL}/sync/history`, {
              method: "POST",
              keepalive: true,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
              body: JSON.stringify({ profileId, history: state.watchHistory }),
            }),
          ]);

          if (!libRes.ok) {
            const body = await libRes.text();
            console.error(`[sync] Library sync failed: ${libRes.status}`, body);
          }
          if (!histRes.ok) {
            const body = await histRes.text();
            console.error(`[sync] History sync failed: ${histRes.status}`, body);
          }
          if (libRes.ok && histRes.ok) {
            console.log('[sync] Library & history synced successfully');
          }

          set({ lastSyncAt: new Date().toISOString() });
        } catch (error) {
          console.error('[sync] Sync fetch error:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      loadFromServer: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        set({ isLoading: true });

        const profileId = get().currentProfileId;
        const profileQuery = profileId
          ? `?profileId=${encodeURIComponent(profileId)}`
          : "";

        try {
          // Use the sync/all endpoint to load everything at once
          const res = await platformFetch(`${API_URL}/sync/all${profileQuery}`, {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          });

          if (res.ok) {
            const { data } = await res.json();
            const serverLibrary: LibraryItem[] = data.library || [];
            const serverHistory: WatchHistoryItem[] = data.history || [];
            const localLibrary = get().library;
            const localHistory = get().watchHistory;

            // Merge instead of overwrite — keeps newer local items that
            // haven't been synced to the server yet (e.g. app closed before
            // debounced sync fired).
            const mergedLibrary = mergeLibrary(localLibrary, serverLibrary);
            const mergedHistory = mergeWatchHistory(localHistory, serverHistory);

            set({
              library: mergedLibrary,
              watchHistory: mergedHistory,
              lastSyncAt: new Date().toISOString(),
            });

            // Push merged state to server so both sides converge
            debouncedSync(() => get().syncWithServer());
          }
        } catch (error) {
          // Only log real errors, not network failures from unconnected backend
          if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) return;
          console.error('Failed to load from server:', error);
        } finally {
          set({ isLoading: false });
          // Backfill missing metadata in the background
          get().backfillMissingMetadata();
        }
      },

      backfillMissingMetadata: async () => {
        const state = get();

        // Collect all items (library + history) that are missing title or poster
        const libraryNeedsFix = state.library.filter(
          (item) => !item.title || item.title === "TBA" || !item.poster,
        );
        const historyNeedsFix = state.watchHistory.filter(
          (item) => !item.title || !item.poster,
        );

        if (libraryNeedsFix.length === 0 && historyNeedsFix.length === 0) return;

        // Deduplicate by imdbId to avoid redundant fetches
        const uniqueIds = new Map<string, "movie" | "series">();
        for (const item of libraryNeedsFix) {
          uniqueIds.set(item.imdbId, item.type);
        }
        for (const item of historyNeedsFix) {
          uniqueIds.set(item.imdbId, item.type);
        }

        // Fetch metadata for all missing items (max 20 at a time to avoid spam)
        const entries = Array.from(uniqueIds.entries()).slice(0, 20);
        const metaMap = new Map<string, { title: string; poster?: string; backdrop?: string; year?: number }>();

        await Promise.all(
          entries.map(async ([imdbId, type]) => {
            const meta = await fetchCinemetaMeta(imdbId, type);
            if (meta && meta.title) {
              metaMap.set(imdbId, meta);
            }
          }),
        );

        if (metaMap.size === 0) return;

        // Apply fixes to library and watch history
        let libraryChanged = false;
        let historyChanged = false;

        const updatedLibrary = state.library.map((item) => {
          const meta = metaMap.get(item.imdbId);
          if (!meta) return item;
          if ((!item.title || item.title === "TBA") || !item.poster) {
            libraryChanged = true;
            return {
              ...item,
              title: (!item.title || item.title === "TBA") ? meta.title : item.title,
              poster: item.poster || meta.poster,
              backdrop: item.backdrop || meta.backdrop,
              year: item.year || meta.year || 0,
            } as LibraryItem;
          }
          return item;
        });

        const updatedHistory = state.watchHistory.map((item) => {
          const meta = metaMap.get(item.imdbId);
          if (!meta) return item;
          if (!item.title || !item.poster) {
            historyChanged = true;
            return {
              ...item,
              title: item.title || meta.title,
              poster: item.poster || meta.poster,
              backdrop: item.backdrop || meta.backdrop,
            };
          }
          return item;
        });

        if (libraryChanged || historyChanged) {
          const patch: Partial<LibraryState> = {};
          if (libraryChanged) patch.library = updatedLibrary;
          if (historyChanged) patch.watchHistory = updatedHistory;
          set(patch);
          // Sync the fixed data to the server
          debouncedSync(() => get().syncWithServer());
        }
      },
    }),
    {
      name: "FlowVid-library",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        library: state.library,
        watchHistory: state.watchHistory,
        profileData: state.profileData,
        currentProfileId: state.currentProfileId,
        activeFilter: state.activeFilter,
        sortBy: state.sortBy,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
