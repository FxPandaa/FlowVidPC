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
// NOTE: images.metahub.space is NOT trusted — it redirects to live.metahub.space
// which returns 200 for HEAD but 404 for GET.  We validate it with GET instead.
const TRUSTED_IMAGE_HOSTS = ["image.tmdb.org"];

function isMetahubUrl(url: string): boolean {
  return url.includes("metahub.space");
}

export function normalizeImageUrl(
  url: string | undefined | null,
): string | null {
  if (!url) return null;
  return url.replace(
    "://live.metahub.space/",
    "://images.metahub.space/",
  );
}

function isTrustedImageUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_IMAGE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

const cache = new Map<string, boolean>();

// ---- Concurrency limiter for tauriFetch ----
const MAX_CONCURRENT_VALIDATIONS = 6;
let _activeValidations = 0;
const _validationQueue: Array<() => void> = [];

function acquireValidationSlot(): Promise<void> {
  if (_activeValidations < MAX_CONCURRENT_VALIDATIONS) {
    _activeValidations++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _validationQueue.push(resolve));
}

function releaseValidationSlot(): void {
  _activeValidations--;
  if (_validationQueue.length > 0) {
    _activeValidations++;
    _validationQueue.shift()!();
  }
}

export function rememberValidatedImageResult(
  url: string | undefined | null,
  isValid: boolean,
): void {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) return;
  cache.set(normalizedUrl, isValid);
  flushCacheToStorage();
}

// Hydrate from localStorage on module init, purging all metahub.space entries
// so they are re-validated with GET (HEAD is unreliable on this CDN).
try {
  const stored = localStorage.getItem(CACHE_STORAGE_KEY);
  if (stored) {
    const entries = JSON.parse(stored) as [string, boolean][];
    let purged = false;
    for (const [url, valid] of entries) {
      if (url.includes('metahub.space')) { purged = true; continue; }
      cache.set(url, valid);
    }
    if (purged) flushCacheToStorage();
  }
} catch {
  // Ignore parse errors
}

let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushCacheToStorage(): void {
  // Debounce: batch rapid writes into a single localStorage flush.
  // On a cold homepage load 80+ validation results arrive within seconds;
  // without debouncing each triggers a synchronous JSON.stringify +
  // localStorage.setItem, blocking the main thread.
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    try {
      const entries = Array.from(cache.entries());
      const trimmed =
        entries.length > MAX_CACHE_ENTRIES
          ? entries.slice(entries.length - MAX_CACHE_ENTRIES)
          : entries;
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }, 2000);
}

/**
 * Check the in-memory cache for a URL's validation status.
 * Returns `true` (known good), `false` (known bad), or `undefined` (unknown).
 */
export function getImageCacheStatus(
  url: string | null | undefined,
): boolean | undefined {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) return false;
  return cache.has(normalizedUrl) ? cache.get(normalizedUrl) : undefined;
}

/**
 * Validate an image URL via tauriFetch HEAD and update the cache.
 * Resolves to `true` when the server responds 2xx, `false` otherwise.
 * Uses the cache to skip redundant requests.
 */
export async function validateImageUrl(
  url: string,
): Promise<boolean> {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) return false;
  if (cache.has(normalizedUrl)) return cache.get(normalizedUrl)!;
  if (isTrustedImageUrl(normalizedUrl)) {
    cache.set(normalizedUrl, true);
    return true;
  }
  await acquireValidationSlot();
  try {
    // metahub.space CDN returns false 200 for HEAD on non-existent images,
    // so we must use GET to get the real status code.  The request goes
    // through Rust (tauriFetch) so the browser console never sees it.
    const method = isMetahubUrl(normalizedUrl) ? "GET" : "HEAD";
    const res = await tauriFetch(normalizedUrl, { method });
    const ok = res.ok;
    rememberValidatedImageResult(normalizedUrl, ok);
    return ok;
  } catch {
    rememberValidatedImageResult(normalizedUrl, false);
    return false;
  } finally {
    releaseValidationSlot();
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
  const normalizedUrl = normalizeImageUrl(url);

  const [validUrl, setValidUrl] = useState<string | null | undefined>(() => {
    if (!normalizedUrl) return null;
    if (isTrustedImageUrl(normalizedUrl)) return normalizedUrl;
    if (cache.has(normalizedUrl)) return cache.get(normalizedUrl) ? normalizedUrl : null;
    return undefined; // unknown yet
  });

  useEffect(() => {
    if (!normalizedUrl) {
      setValidUrl(null);
      return;
    }

    // Trusted hosts: skip HEAD validation, rely on <img> onError fallback
    if (isTrustedImageUrl(normalizedUrl)) {
      setValidUrl(normalizedUrl);
      return;
    }

    // Already resolved
    if (cache.has(normalizedUrl)) {
      setValidUrl(cache.get(normalizedUrl) ? normalizedUrl : null);
      return;
    }

    setValidUrl(undefined);

    let cancelled = false;

    // metahub CDN HEAD lies (returns 200 for non-existent images);
    // use GET through Rust to get the real status.
    const method = isMetahubUrl(normalizedUrl) ? "GET" : "HEAD";
    acquireValidationSlot()
      .then(() =>
        tauriFetch(normalizedUrl, { method })
          .then((res) => {
            const ok = res.ok;
            rememberValidatedImageResult(normalizedUrl, ok);
            if (!cancelled) setValidUrl(ok ? normalizedUrl : null);
          })
          .catch(() => {
            rememberValidatedImageResult(normalizedUrl, false);
            if (!cancelled) setValidUrl(null);
          })
          .finally(() => releaseValidationSlot()),
      );

    return () => {
      cancelled = true;
    };
  }, [normalizedUrl]);

  return validUrl;
}
