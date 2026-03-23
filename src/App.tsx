import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components";
import {
  HomePage,
  SearchPage,
  DetailsPage,
  PlayerPage,
  LibraryPage,
  SettingsPage,
  CalendarPage,
  LoginPage,
  ProfileSelectPage,
  DiscoverPage,
  BrowsePage,
  AddonsPage,
  OnboardingPage,
} from "./pages";
import { useProfileStore, useSettingsStore } from "./stores";
import { STOCK_AVATARS } from "./stores/profileStore";
import { useAuthStore } from "./stores/authStore";
import { useLibraryStore } from "./stores/libraryStore";
import { flushPendingSync } from "./stores/libraryStore";
import { useAddonStore } from "./stores/addonStore";
import { useSubscriptionStore } from "./stores/subscriptionStore";
import { platformFetch } from "./utils/platform";
import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";
import { UpdateModal } from "./components";

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { profiles, activeProfileId } = useProfileStore();

  // Wait for both persisted stores to rehydrate from localStorage before
  // making any routing decisions. Without this, the first render sees empty
  // initial state and briefly shows the home page before redirecting to the
  // profile picker — causing the visible flicker.
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (hydrated) return;
    let done = false;
    const finish = () => {
      if (!done && useAuthStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated()) {
        done = true;
        setHydrated(true);
      }
    };
    const unsubAuth = useAuthStore.persist.onFinishHydration(finish);
    const unsubProfiles = useProfileStore.persist.onFinishHydration(finish);
    finish(); // in case both already hydrated before this effect ran
    return () => { unsubAuth(); unsubProfiles(); };
  }, [hydrated]);

  if (!hydrated) return null;

  // If there are profiles but none is selected, redirect to profile select
  if (profiles.length > 0 && !activeProfileId) {
    return <Navigate to="/profiles" replace />;
  }

  // If the active profile no longer exists, redirect
  if (activeProfileId && !profiles.find((p) => p.id === activeProfileId)) {
    return <Navigate to="/profiles" replace />;
  }

  return <>{children}</>;
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loadFromServer = useLibraryStore((s) => s.loadFromServer);
  const loadSettingsFromServer = useSettingsStore((s) => s.loadFromServer);
  const loadAddonsFromServer = useAddonStore((s) => s.loadFromServer);
  const fetchSubscriptionStatus = useSubscriptionStore((s) => s.fetchStatus);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const createProfile = useProfileStore((s) => s.createProfile);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer();
      loadAddonsFromServer();
      loadSettingsFromServer();
      fetchSubscriptionStatus();

      // Load profiles from server, then ensure a main profile exists
      loadProfiles().then(async () => {        
        const state = useProfileStore.getState();
        let { profiles, activeProfileId } = state;
        let targetProfileId: string | null = activeProfileId;

        if (profiles.length === 0) {
          // No profiles at all — auto-create a main profile
          const name = user?.username || user?.email?.split("@")[0] || "Main";
          const mainProfile = createProfile(name, "#6366f1", "👤", false);
          if (mainProfile) {
            useProfileStore.getState().updateProfile(mainProfile.id, {
              avatarImage: STOCK_AVATARS[0].id,
            });
            // Preserve existing local library/watch data under the new profile
            const libState = useLibraryStore.getState();
            if (libState.library.length > 0 || libState.watchHistory.length > 0) {
              useLibraryStore.setState((s) => ({
                profileData: {
                  ...s.profileData,
                  [mainProfile.id]: {
                    library: s.library,
                    watchHistory: s.watchHistory,
                  },
                },
                currentProfileId: mainProfile.id,
              }));
            }
            setActiveProfile(mainProfile.id);
            targetProfileId = mainProfile.id;
          }
        } else if (!activeProfileId) {
          // Profiles exist but none selected — select the first one
          setActiveProfile(profiles[0].id);
          targetProfileId = profiles[0].id;
        }

        // Always migrate any server-side NULL-profile data to the active profile.
        // This is a no-op if there's nothing under profile_id IS NULL, so it's
        // safe to call every launch — it also handles existing accounts that had
        // data before profiles were introduced.
        if (targetProfileId) {
          try {
            const authState = useAuthStore.getState();
            await platformFetch(`${API_URL}/profiles/${targetProfileId}/migrate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
            });
            // Reload so any migrated data is reflected locally
            loadFromServer();
          } catch (e) {
            console.error("Failed to migrate null-profile data:", e);
          }
        }
      });
    }
  }, [isAuthenticated, loadFromServer, loadSettingsFromServer, loadAddonsFromServer, fetchSubscriptionStatus, loadProfiles, createProfile, setActiveProfile, user]);

  // Flush pending sync before the window closes so the server gets the latest data
  useEffect(() => {
    const handleBeforeUnload = () => flushPendingSync();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return <>{children}</>;
}

function App() {
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  // Check for updates on startup (silently)
  useEffect(() => {
    let cancelled = false;
    const checkUpdate = async () => {
      try {
        const update = await check();
        if (update?.available && !cancelled) {
          setPendingUpdate(update);
        }
      } catch {
        // Silently ignore — don't disrupt the app if check fails
      }
    };
    // Small delay so the app loads first
    const timer = setTimeout(checkUpdate, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <BrowserRouter>
      <AppInitializer>
        {pendingUpdate && (
          <UpdateModal
            update={pendingUpdate}
            onDismiss={() => setPendingUpdate(null)}
          />
        )}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profiles" element={<ProfileSelectPage />} />
          <Route
            path="/"
            element={
              <ProfileGuard>
                <Layout />
              </ProfileGuard>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="browse/:category" element={<BrowsePage />} />
            <Route path="details/:type/:id" element={<DetailsPage />} />
            <Route path="player/:type/:id" element={<PlayerPage />} />
            <Route
              path="player/:type/:id/:season/:episode"
              element={<PlayerPage />}
            />
            <Route path="library" element={<LibraryPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="addons" element={<AddonsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
          </Route>
        </Routes>
      </AppInitializer>
    </BrowserRouter>
  );
}

export default App;
