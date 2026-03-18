import { useState, useEffect } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Module-level cache so validated URLs persist across component
 * mounts / re-renders without re-fetching.
 *
 * The cache is also persisted to localStorage so that on subsequent
 * app launches posters are shown immediately without a HEAD round-trip.
 */
const CACHE_STORAGE_KEY = "FlowVid-image-validation-cache";
const MAX_CACHE_ENTRIES = 500;

// Known trusted image hosts where HEAD requests are unreliable (redirects to
// CDNs that may not support HEAD). For these hosts we skip the HEAD check and
// rely on the <img> onError fallback in components instead.
const TRUSTED_IMAGE_HOSTS = ["images.metahub.space"];

function isTrustedImageUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_IMAGE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

const cache = new Map<string, boolean>();

// Hydrate from localStorage on module init
try {
  const stored = localStorage.getItem(CACHE_STORAGE_KEY);
  if (stored) {
    const entries = JSON.parse(stored) as [string, boolean][];
    for (const [url, valid] of entries) {
      cache.set(url, valid);
    }
  }
} catch {
  // Ignore parse errors
}

function flushCacheToStorage(): void {
  try {
    // Keep only the most recent MAX_CACHE_ENTRIES to avoid unbounded growth
    const entries = Array.from(cache.entries());
    const trimmed =
      entries.length > MAX_CACHE_ENTRIES
        ? entries.slice(entries.length - MAX_CACHE_ENTRIES)
        : entries;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors (e.g. private browsing, quota exceeded)
  }
}

/**
 * Validate an image URL using Tauri's HTTP plugin (goes through Rust,
 * so the browser console never sees a 404). Returns the URL only when
 * the server responds with HTTP 2xx; otherwise returns `null`.
 */
export function useValidatedImage(
  url: string | undefined | null,
): string | null | undefined {
  const [validUrl, setValidUrl] = useState<string | null | undefined>(() => {
    if (!url) return null;
    if (isTrustedImageUrl(url)) return url;
    if (cache.has(url)) return cache.get(url) ? url : null;
    return undefined; // unknown yet
  });

  useEffect(() => {
    if (!url) {
      setValidUrl(null);
      return;
    }

    // Trusted hosts: skip HEAD validation, rely on <img> onError fallback
    if (isTrustedImageUrl(url)) {
      setValidUrl(url);
      return;
    }

    // Already resolved
    if (cache.has(url)) {
      setValidUrl(cache.get(url) ? url : null);
      return;
    }

    setValidUrl(undefined);

    let cancelled = false;

    tauriFetch(url, { method: "HEAD" })
      .then((res) => {
        const ok = res.ok;
        cache.set(url, ok);
        flushCacheToStorage();
        if (!cancelled) setValidUrl(ok ? url : null);
      })
      .catch(() => {
        cache.set(url, false);
        flushCacheToStorage();
        if (!cancelled) setValidUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return validUrl;
}
