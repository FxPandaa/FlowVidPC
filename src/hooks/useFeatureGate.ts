import { useSubscriptionStore } from "../stores/subscriptionStore";

export function useFeatureGate() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const status = subscription?.status;
  const isPaid = status === "active" || status === "trialing";

  return {
    isPaid,
    canWatch: isPaid,
    canAddToLibrary: isPaid,
    canInstallAddons: isPaid,
    canSync: isPaid,
  };
}

/** Non-hook version for use outside React components */
export function getFeatureGate() {
  const subscription = useSubscriptionStore.getState().subscription;
  const status = subscription?.status;
  const isPaid = status === "active" || status === "trialing";
  return { isPaid, canWatch: isPaid, canAddToLibrary: isPaid, canInstallAddons: isPaid, canSync: isPaid };
}
