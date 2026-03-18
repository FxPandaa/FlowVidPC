/**
 * Platform detection & abstraction layer for multi-platform migration.
 *
 * Centralises platform-specific capabilities so the rest of the codebase
 * can import portable helpers instead of Tauri APIs directly.
 */

export type Platform = "tauri-desktop" | "web" | "unknown";

let cachedPlatform: Platform | null = null;

/** Detect the current runtime platform (cached after first call). */
export function getPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;

  // Tauri 2 injects __TAURI_INTERNALS__ on the window object
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    cachedPlatform = "tauri-desktop";
  } else {
    cachedPlatform = "web";
  }
  return cachedPlatform;
}

export function isTauri(): boolean {
  return getPlatform() === "tauri-desktop";
}

/**
 * Platform-aware fetch that bypasses CORS restrictions in Tauri
 * by using the Tauri HTTP plugin, falling back to standard fetch elsewhere.
 *
 * Accepts Tauri-specific options like `connectTimeout` and translates them
 * to standard AbortSignal timeouts on non-Tauri platforms.
 */
export async function platformFetch(
  input: string | URL | Request,
  init?: RequestInit & { connectTimeout?: number },
): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
  }
  // On non-Tauri: translate connectTimeout to AbortSignal.timeout
  if (init?.connectTimeout) {
    const { connectTimeout, ...rest } = init;
    const signal = rest.signal
      ? rest.signal
      : AbortSignal.timeout(connectTimeout);
    return fetch(input, { ...rest, signal });
  }
  return fetch(input, init);
}
