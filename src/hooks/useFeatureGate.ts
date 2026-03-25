import { useSubscriptionStore } from "../stores/subscriptionStore";

/**
 * Determines feature access based on the server-computed hasAccess flag.
 * This correctly handles canceled/past_due subscriptions that still have
 * remaining paid time before the billing period ends.
 */
export function useFeatureGate() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const isPaid = subscription?.hasAccess ?? false;

  return {
    isPaid,
    canWatch: isPaid,
    canAddToLibrary: isPaid,
    canInstallAddons: isPaid,
    canSync: isPaid,
    canWatchParty: isPaid,
  };
}

/** Non-hook version for use outside React components */
export function getFeatureGate() {
  const subscription = useSubscriptionStore.getState().subscription;
  const isPaid = subscription?.hasAccess ?? false;
  return { isPaid, canWatch: isPaid, canAddToLibrary: isPaid, canInstallAddons: isPaid, canSync: isPaid, canWatchParty: isPaid };
}
