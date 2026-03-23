/**
 * FlowVid Desktop - Subscription Store
 * Manages billing/subscription state with the FlowVid API (Creem backend).
 */

import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { platformFetch } from "../utils/platform";

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

export type SubscriptionStatus =
  | "not_subscribed"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "paused"
  | "unpaid";

export type SubscriptionTier = "FlowVid_free" | "FlowVid_plus";

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  plan: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEligible?: boolean;
  hasAccess: boolean;
}

interface SubscriptionState {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  checkoutLoading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  startCheckout: () => Promise<string | null>;
  openPortal: () => Promise<string | null>;
  clearError: () => void;
  clearState: () => void;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const useSubscriptionStore = create<SubscriptionState>()((set) => ({
  subscription: null,
  isLoading: false,
  checkoutLoading: false,
  error: null,

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await platformFetch(`${API_URL}/billing/status`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) {
          set({ subscription: null, isLoading: false });
          return;
        }
        throw new Error("Failed to fetch subscription status");
      }
      const data = await res.json();
      const sub = data.data as SubscriptionInfo;

      // Compute hasAccess locally for resilience — even if the API
      // doesn't return it yet, we mirror the server logic so the
      // client always has an accurate access flag.
      if (sub) {
        const isActiveStatus = sub.status === "active" || sub.status === "trialing";
        const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        const periodStillValid = periodEnd ? periodEnd > new Date() : false;
        sub.hasAccess = isActiveStatus
          || (sub.cancelAtPeriodEnd && periodStillValid)
          || (sub.status === "canceled" && periodStillValid)
          || (sub.status === "past_due" && periodStillValid);
      }

      set({ subscription: sub, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load subscription",
      });
    }
  },

  startCheckout: async () => {
    set({ checkoutLoading: true, error: null });
    try {
      const res = await platformFetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.code === "EMAIL_NOT_VERIFIED") {
          throw new Error("Please verify your email address before subscribing.");
        }
        if (data.code === "ALREADY_SUBSCRIBED") {
          throw new Error(data.error || "You already have an active subscription.");
        }
        throw new Error(data.error || "Failed to start checkout");
      }
      const data = await res.json();
      // Store trial eligibility so UI can reflect it
      const current = useSubscriptionStore.getState().subscription;
      if (current) {
        set({ subscription: { ...current, trialEligible: data.data.trialEligible } });
      }
      set({ checkoutLoading: false });
      // API returns { success: true, data: { url: "...", provider: "creem", trialEligible } }
      return data.data.url as string;
    } catch (err) {
      set({
        checkoutLoading: false,
        error: err instanceof Error ? err.message : "Failed to start checkout",
      });
      return null;
    }
  },

  openPortal: async () => {
    try {
      const res = await platformFetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to open billing portal");
      }
      const data = await res.json();
      // API returns { success: true, data: { url: "..." } }
      return data.data.url as string;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to open billing portal",
      });
      return null;
    }
  },

  clearError: () => set({ error: null }),
  clearState: () => set({
    subscription: null,
    isLoading: false,
    checkoutLoading: false,
    error: null,
  }),
}));
