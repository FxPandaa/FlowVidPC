import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { platformFetch } from "../utils/platform";

function clearUserScopedStateAsync(): void {
  void import("./sessionCleanup")
    .then(({ clearUserScopedState }) => {
      clearUserScopedState();
    })
    .catch(() => {});
}

interface User {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  attemptTokenRefresh: () => Promise<boolean>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await platformFetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || data.message || "Login failed");
          }

          const userData = data.data?.user || data.user;
          const token = data.data?.tokens?.accessToken || data.token;
          const refreshToken = data.data?.tokens?.refreshToken || null;

          set({
            user: userData,
            token,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Login failed",
          });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await platformFetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || data.message || "Registration failed",
            );
          }

          const userData = data.data?.user || data.user;
          const token = data.data?.tokens?.accessToken || data.token;
          const refreshToken = data.data?.tokens?.refreshToken || null;

          set({
            user: userData,
            token,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error:
              error instanceof Error ? error.message : "Registration failed",
          });
          throw error;
        }
      },

      attemptTokenRefresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const response = await platformFetch(`${API_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            get().logout();
            return false;
          }

          const data = await response.json();
          const newToken = data.data?.tokens?.accessToken;
          const newRefreshToken = data.data?.tokens?.refreshToken;

          if (newToken) {
            const updatedUser = data.data?.user;
            set({
              token: newToken,
              refreshToken: newRefreshToken || refreshToken,
              ...(updatedUser ? { user: updatedUser } : {}),
            });
            return true;
          }

          get().logout();
          return false;
        } catch {
          get().logout();
          return false;
        }
      },

      logout: () => {
        const { token, refreshToken } = get();

        // Invalidate refresh token on the server (fire-and-forget)
        if (token) {
          platformFetch(`${API_URL}/auth/logout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(
              refreshToken ? { refreshToken } : {},
            ),
          }).catch(() => {});
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });

        clearUserScopedStateAsync();
      },

      verifyEmail: async (code: string) => {
        const { token } = get();
        if (!token) throw new Error("Not authenticated");

        set({ isLoading: true, error: null });
        try {
          const response = await platformFetch(`${API_URL}/auth/verify-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ code }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || data.message || "Verification failed");
          }

          // Update user state
          const user = get().user;
          if (user) {
            set({ user: { ...user, emailVerified: true }, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Verification failed",
          });
          throw error;
        }
      },

      resendVerification: async () => {
        const { token } = get();
        if (!token) throw new Error("Not authenticated");

        const response = await platformFetch(`${API_URL}/auth/resend-verification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || data.message || "Failed to resend code");
        }
      },

      setError: (error: string | null) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "FlowVid-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

/**
 * Authenticated fetch with automatic token refresh on 401.
 * Other stores can use this instead of raw fetch to get auto-refresh.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const state = useAuthStore.getState();
  if (!state.token) throw new Error("Not authenticated");

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${state.token}`,
  } as Record<string, string>;

  let response = await platformFetch(url, { ...options, headers });

  if (response.status === 401 && state.refreshToken) {
    const refreshed = await state.attemptTokenRefresh();
    if (refreshed) {
      const newToken = useAuthStore.getState().token;
      headers.Authorization = `Bearer ${newToken}`;
        response = await platformFetch(url, { ...options, headers });
    }
  }

  return response;
}
