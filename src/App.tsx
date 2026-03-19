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
import { useAuthStore } from "./stores/authStore";
import { useLibraryStore } from "./stores/libraryStore";
import { useAddonStore } from "./stores/addonStore";
import { useSubscriptionStore } from "./stores/subscriptionStore";
import { useEffect } from "react";

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { profiles, activeProfileId } = useProfileStore();

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
  const loadFromServer = useLibraryStore((s) => s.loadFromServer);
  const loadSettingsFromServer = useSettingsStore((s) => s.loadFromServer);
  const loadAddonsFromServer = useAddonStore((s) => s.loadFromServer);
  const fetchSubscriptionStatus = useSubscriptionStore((s) => s.fetchStatus);

  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer();
      loadAddonsFromServer();
      loadSettingsFromServer();
      fetchSubscriptionStatus();
    }
  }, [isAuthenticated, loadFromServer, loadSettingsFromServer, loadAddonsFromServer, fetchSubscriptionStatus]);

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AppInitializer>
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
