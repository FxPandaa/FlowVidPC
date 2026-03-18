/**
 * FlowVid Addon System — Types
 *
 * Compatible with the Stremio addon protocol.
 * Reference: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
 */

// ---------------------------------------------------------------------------
// Manifest schema (Stremio-compatible)
// ---------------------------------------------------------------------------

export type AddonResourceType =
  | "catalog"
  | "meta"
  | "stream"
  | "subtitles"
  | "addon_catalog";

export type AddonContentType =
  | "movie"
  | "series"
  | "channel"
  | "tv"
  | "anime"
  | string;

export interface AddonCatalog {
  type: AddonContentType;
  id: string;
  name: string;
  extra?: CatalogExtra[];
  extraRequired?: string[];
  extraSupported?: string[];
}

export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

export interface AddonResource {
  name: AddonResourceType;
  types: AddonContentType[];
  idPrefixes?: string[];
}

export interface AddonBehaviorHints {
  adult?: boolean;
  p2p?: boolean;
  configurable?: boolean;
  configurationRequired?: boolean;
}

/** The full manifest returned by {addonUrl}/manifest.json */
export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  background?: string;
  contactEmail?: string;
  resources: (AddonResourceType | AddonResource)[];
  types: AddonContentType[];
  catalogs: AddonCatalog[];
  behaviorHints?: AddonBehaviorHints;
  // Non-standard extras
  idPrefixes?: string[];
}

// ---------------------------------------------------------------------------
// Stream result types (what /stream/{type}/{id}.json returns)
// ---------------------------------------------------------------------------

export interface AddonStreamSubtitle {
  id: string;
  url: string;
  lang: string;
}

export interface AddonStream {
  /** Direct playable URL (HTTP/HTTPS/HLS). Mutually exclusive with infoHash. */
  url?: string;
  /** BitTorrent info hash. Mutually exclusive with url. */
  infoHash?: string;
  /** File index within a torrent (when using infoHash). */
  fileIdx?: number;
  /** External player URL (e.g. magnet:). */
  externalUrl?: string;
  /** Human-readable stream name (e.g., "[YTS] 1080p BluRay"). */
  name?: string;
  /** Longer description shown under the stream name. */
  description?: string;
  /** Short title (deprecated alias for name). */
  title?: string;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
  };
  subtitles?: AddonStreamSubtitle[];
}

export interface AddonStreamsResponse {
  streams: AddonStream[];
}

// ---------------------------------------------------------------------------
// Installed addon record (what FlowVid stores locally and syncs)
// ---------------------------------------------------------------------------

export interface InstalledAddon {
  /** Unique ID matching manifest.id */
  id: string;
  /** The URL this addon was installed from (points to manifest.json) */
  manifestUrl: string;
  /** Cached manifest — re-fetched periodically. Allows offline use. */
  manifest: AddonManifest;
  /** Whether the addon is active. Disabled addons are skipped for stream queries. */
  enabled: boolean;
  /** 0-based display/priority order */
  order: number;
  /** ISO timestamp when installed */
  installedAt: string;
  /** ISO timestamp when manifest was last fetched */
  lastFetched: string;
}

// ---------------------------------------------------------------------------
// Sync payload (what the API stores and returns)
// ---------------------------------------------------------------------------

export interface AddonSyncEntry {
  id: string;
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  order: number;
  installedAt: string;
  lastFetched: string;
  updatedAt: string;
}
