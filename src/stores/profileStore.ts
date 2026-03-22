import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useLibraryStore } from "./libraryStore";
import { useAuthStore } from "./authStore";
import { platformFetch } from "../utils/platform";

export const MAX_PROFILES = 8;

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

// Profile avatar options - color + icon combos
export const PROFILE_AVATARS = [
  { color: "#00E5FF", icon: "😊" },
  { color: "#ef4444", icon: "😎" },
  { color: "#22c55e", icon: "🤩" },
  { color: "#f97316", icon: "🦊" },
  { color: "#007AFF", icon: "🐱" },
  { color: "#ec4899", icon: "🌸" },
  { color: "#06b6d4", icon: "🌊" },
  { color: "#eab308", icon: "⭐" },
  { color: "#3b82f6", icon: "🎮" },
  { color: "#10b981", icon: "🌿" },
  { color: "#f43f5e", icon: "🔥" },
  { color: "#3b82f6", icon: "🎵" },
] as const;

// Stock profile pictures — gradient circles with glyph overlays.
// Each is a small inline SVG data-URI so no external files are needed.
function buildAvatarSvg(gradient: [string, string], symbol: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradient[0]}"/>
      <stop offset="100%" stop-color="${gradient[1]}"/>
    </linearGradient></defs>
    <circle cx="64" cy="64" r="64" fill="url(#g)"/>
    <text x="64" y="64" text-anchor="middle" dominant-baseline="central" font-size="56">${symbol}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const STOCK_AVATARS: { id: string; url: string; label: string }[] = [
  { id: "avatar-wolf",       url: buildAvatarSvg(["#6366f1", "#a855f7"], "🐺"), label: "Wolf" },
  { id: "avatar-bear",       url: buildAvatarSvg(["#92400e", "#d97706"], "🐻"), label: "Bear" },
  { id: "avatar-panda",      url: buildAvatarSvg(["#22c55e", "#16a34a"], "🐼"), label: "Panda" },
  { id: "avatar-lion",       url: buildAvatarSvg(["#f59e0b", "#ef4444"], "🦁"), label: "Lion" },
  { id: "avatar-penguin",    url: buildAvatarSvg(["#06b6d4", "#3b82f6"], "🐧"), label: "Penguin" },
  { id: "avatar-fox",        url: buildAvatarSvg(["#ea580c", "#f97316"], "🦊"), label: "Fox" },
  { id: "avatar-cat",        url: buildAvatarSvg(["#ec4899", "#f43f5e"], "🐱"), label: "Cat" },
  { id: "avatar-dog",        url: buildAvatarSvg(["#8b5cf6", "#6366f1"], "🐶"), label: "Dog" },
  { id: "avatar-owl",        url: buildAvatarSvg(["#1e3a5f", "#3b82f6"], "🦉"), label: "Owl" },
  { id: "avatar-unicorn",    url: buildAvatarSvg(["#d946ef", "#ec4899"], "🦄"), label: "Unicorn" },
  { id: "avatar-dragon",     url: buildAvatarSvg(["#059669", "#10b981"], "🐉"), label: "Dragon" },
  { id: "avatar-alien",      url: buildAvatarSvg(["#14b8a6", "#06b6d4"], "👽"), label: "Alien" },
  { id: "avatar-robot",      url: buildAvatarSvg(["#64748b", "#94a3b8"], "🤖"), label: "Robot" },
  { id: "avatar-astronaut",  url: buildAvatarSvg(["#1e293b", "#475569"], "🧑‍🚀"), label: "Astronaut" },
  { id: "avatar-ninja",      url: buildAvatarSvg(["#0f172a", "#334155"], "🥷"), label: "Ninja" },
  { id: "avatar-star",       url: buildAvatarSvg(["#eab308", "#fbbf24"], "⭐"), label: "Star" },
];

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon: string;
  avatarImage?: string; // Stock avatar image ID or data URI
  isKid: boolean;
  createdAt: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string | null;

  // Actions
  createProfile: (
    name: string,
    avatarColor: string,
    avatarIcon: string,
    isKid?: boolean,
  ) => Profile | null;
  updateProfile: (
    id: string,
    updates: Partial<
      Pick<Profile, "name" | "avatarColor" | "avatarIcon" | "avatarImage" | "isKid">
    >,
  ) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  getActiveProfile: () => Profile | null;
  canCreateProfile: () => boolean;

  // Server sync
  syncProfiles: () => Promise<void>;
  loadProfiles: () => Promise<void>;

  // Clear all data (for logout)
  clearAll: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,

      createProfile: (name, avatarColor, avatarIcon, isKid = false) => {
        if (get().profiles.length >= MAX_PROFILES) return null;

        const newProfile: Profile = {
          id: crypto.randomUUID(),
          name: name.trim(),
          avatarColor,
          avatarIcon,
          isKid,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          profiles: [...state.profiles, newProfile],
        }));

        // Sync to server in background
        get().syncProfiles();

        return newProfile;
      },

      updateProfile: (id, updates) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...updates,
                  name: updates.name ? updates.name.trim() : p.name,
                }
              : p,
          ),
        }));

        get().syncProfiles();
      },

      deleteProfile: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          // Clear active if deleting active profile
          activeProfileId:
            state.activeProfileId === id ? null : state.activeProfileId,
        }));

        get().syncProfiles();
      },

      setActiveProfile: (id) => {
        set({ activeProfileId: id });
        // Switch library data to the selected profile
        useLibraryStore.getState().switchProfile(id);
      },

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return profiles.find((p) => p.id === activeProfileId) || null;
      },

      canCreateProfile: () => {
        return get().profiles.length < MAX_PROFILES;
      },

      syncProfiles: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        try {
          await platformFetch(`${API_URL}/profiles/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authState.token}`,
            },
            body: JSON.stringify({ profiles: get().profiles }),
          });
        } catch (error) {
          console.error("Failed to sync profiles:", error);
        }
      },

      loadProfiles: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        try {
          const res = await platformFetch(`${API_URL}/profiles`, {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.profiles && data.profiles.length > 0) {
              // Merge: keep local avatarImage if server doesn't have one yet
              const localProfiles = get().profiles;
              let hadLocalImages = false;
              const merged = data.profiles.map((sp: Profile) => {
                const local = localProfiles.find((lp) => lp.id === sp.id);
                const avatarImage = sp.avatarImage || (local ? local.avatarImage : undefined);
                if (avatarImage && !sp.avatarImage) hadLocalImages = true;
                return { ...sp, avatarImage };
              });
              set({ profiles: merged });
              // Push local avatar images up to server if they weren't there yet
              if (hadLocalImages) {
                get().syncProfiles();
              }
            }
          }
        } catch (error) {
          console.error("Failed to load profiles from server:", error);
        }
      },

      clearAll: () => {
        set({ profiles: [], activeProfileId: null });
      },
    }),
    {
      name: "FlowVid-profiles",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
