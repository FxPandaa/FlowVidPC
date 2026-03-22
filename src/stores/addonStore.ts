/**
 * FlowVid Addon Store
 *
 * Manages the user's installed addons. This is the single source of truth for:
 *   - Which addons are installed
 *   - Their enabled state and priority order
 *   - The cached manifest data
 *
 * Architecture (mirrors Stremio's approach):
 *   - Only manifest URLs + cached manifests are stored/synced — never stream results
 *   - Sync uses last-write-wins on the full addon list
 *   - On each device after sync, manifests are re-fetched on first use (staleness check)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fetchManifest, getAddonBaseUrl, fetchStreams } from "../services/addons/client";
import type { InstalledAddon, AddonStream } from "../services/addons/types";
import { useAuthStore } from "./authStore";

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

export interface AddonStreamResult {
  addonId: string;
  addonName: string;
  addonLogo?: string;
  streams: AddonStream[];
  error?: string;
}

interface AddonState {
  addons: InstalledAddon[];
  isLoading: boolean;
  error: string | null;

  // Install / remove
  installAddon: (manifestUrl: string) => Promise<void>;
  removeAddon: (addonId: string) => void;

  // Management
  toggleAddon: (addonId: string) => void;
  reorderAddon: (addonId: string, newOrder: number) => void;
  refreshManifest: (addonId: string) => Promise<void>;

  // Stream querying — queries all enabled addons in parallel
  getStreams: (type: string, id: string) => Promise<AddonStreamResult[]>;

  /**
   * Progressive stream querying — calls onResult as each addon responds
   * so the UI can show streams immediately without waiting for all addons.
   * Returns the final combined array when all addons have responded.
   */
  getStreamsProgressive: (
    type: string,
    id: string,
    onResult: (accumulated: AddonStreamResult[], pendingAddonNames: string[]) => void,
  ) => Promise<AddonStreamResult[]>;

  // Sync with backend
  syncToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;

  clearError: () => void;
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const useAddonStore = create<AddonState>()(
  persist(
    (set, get) => ({
      addons: [],
      isLoading: false,
      error: null,

      installAddon: async (manifestUrl: string) => {
        set({ isLoading: true, error: null });
        try {
          const manifest = await fetchManifest(manifestUrl);

          // Check for duplicates
          const existing = get().addons.find((a) => a.id === manifest.id);
          if (existing) {
            // Update the manifest URL (user may have reconfigured) + refresh manifest
            set((state) => ({
              addons: state.addons.map((a) =>
                a.id === manifest.id
                  ? { ...a, manifestUrl, manifest, lastFetched: new Date().toISOString() }
                  : a
              ),
              isLoading: false,
            }));
            get().syncToServer();
            return;
          }

          const newAddon: InstalledAddon = {
            id: manifest.id,
            manifestUrl,
            manifest,
            enabled: true,
            order: get().addons.length,
            installedAt: new Date().toISOString(),
            lastFetched: new Date().toISOString(),
          };

          set((state) => ({
            addons: [...state.addons, newAddon],
            isLoading: false,
          }));

          get().syncToServer();
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to install addon",
          });
          throw err;
        }
      },

      removeAddon: (addonId: string) => {
        set((state) => ({
          addons: state.addons
            .filter((a) => a.id !== addonId)
            .map((a, i) => ({ ...a, order: i })),
        }));
        get().syncToServer();
      },

      toggleAddon: (addonId: string) => {
        set((state) => ({
          addons: state.addons.map((a) =>
            a.id === addonId ? { ...a, enabled: !a.enabled } : a
          ),
        }));
        get().syncToServer();
      },

      reorderAddon: (addonId: string, newOrder: number) => {
        set((state) => {
          const sorted = [...state.addons].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((a) => a.id === addonId);
          if (idx === -1) return state;
          const [moved] = sorted.splice(idx, 1);
          const clampedOrder = Math.max(0, Math.min(newOrder, sorted.length));
          sorted.splice(clampedOrder, 0, moved);
          return { addons: sorted.map((a, i) => ({ ...a, order: i })) };
        });
        get().syncToServer();
      },

      refreshManifest: async (addonId: string) => {
        const addon = get().addons.find((a) => a.id === addonId);
        if (!addon) return;
        try {
          const manifest = await fetchManifest(addon.manifestUrl);
          set((state) => ({
            addons: state.addons.map((a) =>
              a.id === addonId
                ? { ...a, manifest, lastFetched: new Date().toISOString() }
                : a
            ),
          }));
        } catch (err) {
          console.warn(`[addons] Failed to refresh manifest for ${addonId}:`, err);
        }
      },

      getStreams: async (type: string, id: string): Promise<AddonStreamResult[]> => {
        const enabledAddons = get().addons
          .filter((a) => a.enabled)
          .filter((a) => {
            // Only query addons that declare stream support for this type
            const resources = a.manifest.resources ?? [];
            const hasStream = resources.some((r) =>
              typeof r === "string"
                ? r === "stream"
                : r.name === "stream" && (r.types == null || r.types.includes(type as any))
            );
            const supportsType = a.manifest.types.includes(type as any);
            return hasStream && supportsType;
          })
          .sort((a, b) => a.order - b.order);

        if (enabledAddons.length === 0) return [];

        const results = await Promise.allSettled(
          enabledAddons.map(async (addon): Promise<AddonStreamResult> => {
            const baseUrl = getAddonBaseUrl(addon.manifestUrl);
            try {
              const streams = await fetchStreams(baseUrl, type, id);
              return { addonId: addon.id, addonName: addon.manifest.name, addonLogo: addon.manifest.logo, streams };
            } catch (err) {
              return {
                addonId: addon.id,
                addonName: addon.manifest.name,
                addonLogo: addon.manifest.logo,
                streams: [],
                error: err instanceof Error ? err.message : "Unknown error",
              };
            }
          })
        );

        return results
          .filter((r): r is PromiseFulfilledResult<AddonStreamResult> => r.status === "fulfilled")
          .map((r) => r.value);
      },

      getStreamsProgressive: async (
        type: string,
        id: string,
        onResult: (accumulated: AddonStreamResult[], pendingAddonNames: string[]) => void,
      ): Promise<AddonStreamResult[]> => {
        const enabledAddons = get().addons
          .filter((a) => a.enabled)
          .filter((a) => {
            const resources = a.manifest.resources ?? [];
            const hasStream = resources.some((r) =>
              typeof r === "string"
                ? r === "stream"
                : r.name === "stream" && (r.types == null || r.types.includes(type as any))
            );
            return hasStream && a.manifest.types.includes(type as any);
          })
          .sort((a, b) => a.order - b.order);

        if (enabledAddons.length === 0) return [];

        const accumulated: AddonStreamResult[] = [];
        const allAddonNames = enabledAddons.map((a) => a.manifest.name);
        const respondedIds = new Set<string>();

        // Report initial state — all addons pending
        onResult([], [...allAddonNames]);

        const promises = enabledAddons.map(async (addon) => {
          const baseUrl = getAddonBaseUrl(addon.manifestUrl);
          let result: AddonStreamResult;
          try {
            const streams = await fetchStreams(baseUrl, type, id);
            result = { addonId: addon.id, addonName: addon.manifest.name, addonLogo: addon.manifest.logo, streams };
          } catch (err) {
            result = {
              addonId: addon.id,
              addonName: addon.manifest.name,
              addonLogo: addon.manifest.logo,
              streams: [],
              error: err instanceof Error ? err.message : "Unknown error",
            };
          }
          accumulated.push(result);
          respondedIds.add(addon.id);
          const pending = enabledAddons
            .filter((a) => !respondedIds.has(a.id))
            .map((a) => a.manifest.name);
          onResult([...accumulated], pending);
        });

        await Promise.allSettled(promises);
        return accumulated;
      },

      syncToServer: async () => {
        const { token, isAuthenticated } = useAuthStore.getState();
        if (!isAuthenticated || !token) return;

        try {
          const payload = get().addons.map((a) => ({
            id: a.id,
            manifestUrl: a.manifestUrl,
            manifest: JSON.stringify(a.manifest),
            enabled: a.enabled,
            sortOrder: a.order,
          }));

          console.log(`[sync] Syncing ${payload.length} addons to ${API_URL}`);

          const res = await fetch(`${API_URL}/sync/addons`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ addons: payload }),
          });

          if (!res.ok) {
            const body = await res.text();
            console.error(`[sync] Addon sync failed: ${res.status}`, body);
          } else {
            console.log('[sync] Addons synced successfully');
          }
        } catch (err) {
          console.error("[sync] Addon sync fetch error:", err);
        }
      },

      loadFromServer: async () => {
        const { token, isAuthenticated } = useAuthStore.getState();
        if (!isAuthenticated || !token) return;

        try {
          const response = await fetch(`${API_URL}/sync/addons`, {
            headers: getAuthHeaders(),
          });
          if (!response.ok) return;

          const data = await response.json();
          const serverAddons: InstalledAddon[] = (data.addons ?? []).map(
            (a: any) => ({
              id: a.id,
              manifestUrl: a.manifestUrl,
              manifest: a.manifest,
              enabled: a.enabled ?? true,
              order: a.sortOrder ?? 0,
              installedAt: a.installedAt ?? new Date().toISOString(),
              lastFetched: a.lastFetched ?? new Date().toISOString(),
            })
          );

          if (serverAddons.length > 0) {
            set({ addons: serverAddons });
          }
        } catch (err) {
          console.warn("[addons] Load from server failed:", err);
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "FlowVid-addons",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ addons: state.addons }),
    }
  )
);
