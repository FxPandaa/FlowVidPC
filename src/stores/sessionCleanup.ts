import { useAddonStore } from "./addonStore";
import { useLibraryStore } from "./libraryStore";
import { useProfileStore } from "./profileStore";
import { useSubscriptionStore } from "./subscriptionStore";

/**
 * Clears account-scoped local state while keeping device-wide settings intact.
 */
export function clearUserScopedState(): void {
  useProfileStore.getState().clearAll();
  useLibraryStore.getState().clearAll();
  useAddonStore.getState().clearAll();
  useSubscriptionStore.getState().clearState();

  useProfileStore.persist.clearStorage();
  useLibraryStore.persist.clearStorage();
  useAddonStore.persist.clearStorage();
}