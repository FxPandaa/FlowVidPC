/**
 * FlowVid Addon Client
 *
 * Handles all HTTP communication with Stremio-compatible addons:
 *   - Fetching and validating manifests
 *   - Querying stream results for a given title
 *   - Querying catalog results
 *
 * No hardcoded providers or built-in source services.
 * All traffic goes only to URLs explicitly provided by the user.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type {
  AddonManifest,
  AddonStreamsResponse,
  AddonStream,
} from "./types";

const MANIFEST_TIMEOUT_MS = 10_000;
const STREAM_TIMEOUT_MS = 15_000;

/** Derive the base URL of an addon from its manifest URL */
export function getAddonBaseUrl(manifestUrl: string): string {
  // e.g. https://addon.example.com/manifesthash/manifest.json
  //   -> https://addon.example.com/manifesthash
  return manifestUrl.replace(/\/manifest\.json$/i, "");
}

/** Fetch and validate a manifest from a URL. Throws on failure. */
export async function fetchManifest(manifestUrl: string): Promise<AddonManifest> {
  // Normalise URL: if user pasted a base URL without /manifest.json, append it
  const url = manifestUrl.endsWith("/manifest.json")
    ? manifestUrl
    : manifestUrl.replace(/\/$/, "") + "/manifest.json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);

  try {
    const response = await tauriFetch(url, {
      method: "GET",
      headers: { "User-Agent": "FlowVid/2.0" },
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    const data: unknown = await response.json();
    return validateManifest(data, url);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Addon timed out after ${MANIFEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
}

function validateManifest(data: unknown, url: string): AddonManifest {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid manifest: not a JSON object");
  }
  const m = data as Record<string, unknown>;
  const required = ["id", "name", "version", "resources", "types"];
  for (const key of required) {
    if (!m[key]) throw new Error(`Invalid manifest: missing "${key}" (from ${url})`);
  }
  if (!Array.isArray(m.types) || m.types.length === 0) {
    throw new Error("Invalid manifest: types must be a non-empty array");
  }
  return m as unknown as AddonManifest;
}

/**
 * Query an addon for streams for a given content item.
 *
 * @param baseUrl  Addon base URL (without /manifest.json)
 * @param type     "movie" | "series"
 * @param id       Content identifier (e.g. "tt1234567" for IMDB, or "tt1234567:1:3" for series s1e3)
 */
export async function fetchStreams(
  baseUrl: string,
  type: string,
  id: string,
): Promise<AddonStream[]> {
  const url = `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  try {
    const response = await tauriFetch(url, {
      method: "GET",
      headers: { "User-Agent": "FlowVid/2.0" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 404) return []; // Addon doesn't have this content
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as AddonStreamsResponse;
    return Array.isArray(data?.streams) ? data.streams : [];
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[addon] Stream query timed out for ${baseUrl}`);
      return [];
    }
    console.warn(`[addon] Stream query failed for ${baseUrl}:`, err);
    return [];
  }
}

export type { AddonManifest, AddonStream, AddonStreamsResponse };
