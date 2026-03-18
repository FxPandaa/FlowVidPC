/**
 * Stream Info Parser - Extracts quality, codec, HDR, and audio info from torrent titles
 */

export interface StreamInfo {
  // Video
  resolution: string;
  resolutionBadge: "4K" | "1080p" | "720p" | "480p" | "Unknown";
  videoCodec: string;
  bitDepth?: string;

  // HDR
  hdrType: "SDR" | "HDR10" | "HDR10+" | "Dolby Vision" | "HLG";
  dolbyVisionProfile?: string;
  isHDR: boolean;
  hasDolbyVision: boolean; // True if DV is present (for dual-layer detection)
  hasHDR10Plus: boolean; // True if HDR10+ is present (for dual-layer detection)

  // Audio
  audioCodec: string;
  audioChannels: string;
  hasAtmos: boolean;

  // Source
  source: string;
  releaseGroup: string;

  // Additional
  languages: string[];
  isRemux: boolean;
  is3D: boolean;
}

// Color scheme for badges
export const BADGE_COLORS = {
  SDR: "#6B7280",
  HDR10: "#F59E0B",
  "HDR10+": "#F59E0B",
  "Dolby Vision": "#007AFF",
  Atmos: "#3B82F6",
  "4K": "#10B981",
  "1080p": "#3B82F6",
  "720p": "#6B7280",
  "480p": "#4B5563",
  HEVC: "#3b82f6",
  AV1: "#EC4899",
  x264: "#6B7280",
  Remux: "#F59E0B",
};

/**
 * Parse torrent title (and optional description) to extract stream information.
 * Passing description greatly improves HDR/quality detection for addons like
 * Torrentio that embed quality tags in the description instead of the name.
 */
export function parseStreamInfo(title: string, description?: string): StreamInfo {
  // Merge name + description so all tags are visible to every detector
  const combined = description ? `${title} ${description}` : title;
  const t = combined.toUpperCase();

  // Detect DV and HDR10+ separately for dual-layer detection
  const hasDolbyVision = detectDolbyVision(t);
  const hasHDR10Plus =
    t.includes("HDR10+") || t.includes("HDR10PLUS") || t.includes("HDR10 PLUS") ||
    t.includes("HDR10 +") || t.includes("HDR10.PLUS") ||
    /HDR\.?10\+/.test(t) || /HDR[\s.]?10[\s.]?PLUS/.test(t);

  return {
    resolution: parseResolution(t),
    resolutionBadge: parseResolutionBadge(t),
    videoCodec: parseVideoCodec(t),
    bitDepth: parseBitDepth(t),
    hdrType: parseHDRType(t),
    dolbyVisionProfile: parseDolbyVisionProfile(t),
    isHDR: detectHDR(t),
    hasDolbyVision,
    hasHDR10Plus,
    audioCodec: parseAudioCodec(t),
    audioChannels: parseAudioChannels(t),
    hasAtmos: detectAtmos(t),
    source: parseSource(t),
    releaseGroup: parseReleaseGroup(title),
    languages: parseLanguages(t),
    isRemux: t.includes("REMUX"),
    is3D: detect3D(t),
  };
}

function parseResolution(t: string): string {
  if (t.includes("2160P") || t.includes("4K") || t.includes("UHD"))
    return "2160p";
  if (t.includes("1080P") || t.includes("FHD")) return "1080p";
  if (t.includes("720P") || t.includes("HD")) return "720p";
  if (t.includes("480P") || t.includes("SD")) return "480p";
  if (t.includes("576P")) return "576p";
  return "Unknown";
}

function parseResolutionBadge(
  t: string,
): "4K" | "1080p" | "720p" | "480p" | "Unknown" {
  if (t.includes("2160P") || t.includes("4K") || t.includes("UHD")) return "4K";
  if (t.includes("1080P") || t.includes("FHD")) return "1080p";
  if (t.includes("720P")) return "720p";
  if (t.includes("480P") || t.includes("SD")) return "480p";
  return "Unknown";
}

function parseVideoCodec(t: string): string {
  if (
    t.includes("HEVC") ||
    t.includes("X265") ||
    t.includes("H.265") ||
    t.includes("H265")
  )
    return "HEVC";
  if (
    t.includes("X264") ||
    t.includes("H.264") ||
    t.includes("H264") ||
    t.includes("AVC")
  )
    return "x264";
  if (t.includes("AV1")) return "AV1";
  if (t.includes("VP9")) return "VP9";
  if (t.includes("XVID") || t.includes("DIVX")) return "XviD";
  return "";
}

function parseBitDepth(t: string): string | undefined {
  if (t.includes("10BIT") || t.includes("10-BIT") || t.includes("HI10P"))
    return "10-bit";
  if (t.includes("12BIT") || t.includes("12-BIT")) return "12-bit";
  if (t.includes("8BIT") || t.includes("8-BIT")) return "8-bit";
  return undefined;
}

/** Centralised Dolby Vision detection — used in multiple places */
function detectDolbyVision(t: string): boolean {
  return (
    t.includes("DOLBY VISION") ||
    t.includes("DOLBYVISION") ||
    t.includes("DOVI") ||
    t.includes("DVHE") || // DV HEVC codec id
    t.includes("DVH1") || // DV HEVC codec id variant
    // \bDV\b — word boundary catches end-of-string, parens, brackets, pipes
    /\bDV\b/.test(t) ||
    // Explicit delimiter set for names that use dots, spaces, pipes, brackets
    /[.\s|([\-]DV[.\s|)\]\-]/.test(t) ||
    // DV at end of string (e.g. "4k HDR DV")
    /[.\s|([\-]DV$/.test(t) ||
    // DV with profile notation (e.g. "DV.HDR" or "DV HDR")
    /DV[.\s]?HDR/.test(t)
  );
}

function parseHDRType(
  t: string,
): "SDR" | "HDR10" | "HDR10+" | "Dolby Vision" | "HLG" {
  const hasDV = detectDolbyVision(t);

  // Check for HDR10+ — various notations used in torrent names
  const hasHDR10Plus =
    t.includes("HDR10+") || t.includes("HDR10PLUS") || t.includes("HDR10 PLUS") ||
    t.includes("HDR10 +") || t.includes("HDR10.PLUS") ||
    /HDR\.?10\+/.test(t) || /HDR[\s.]?10[\s.]?PLUS/.test(t);

  // Check for HDR10 — catches HDR10, HDR.10, HDR-10, HDR 10
  const hasHDR10 =
    /HDR\.?10(?!\+|PLUS)/.test(t) ||
    t.includes("HDR 10") || t.includes("HDR-10");

  // Dual layer: DV + HDR10+ is the best combo - show as Dolby Vision
  if (hasDV && hasHDR10Plus) {
    return "Dolby Vision";
  }

  // HDR10+ standalone
  if (hasHDR10Plus) {
    return "HDR10+";
  }

  // Dolby Vision without HDR10+
  if (hasDV) {
    return "Dolby Vision";
  }

  // HDR10
  if (hasHDR10) {
    return "HDR10";
  }

  // Generic HDR: plain HDR, BT.2020, WCG (Wide Color Gamut), PQ (EOTF)
  if (
    /\bHDR\b/.test(t) ||
    /[\[.\s]HDR[\].\s]/.test(t) ||
    t.includes("BT2020") ||
    t.includes("BT.2020") ||
    t.includes("BT 2020") ||
    t.includes("REC2020") ||
    t.includes("REC.2020") ||
    t.includes("REC 2020") ||
    /\bWCG\b/.test(t) ||
    /\bPQ\b/.test(t) ||
    /\bSMPTE[\s.]?2084\b/.test(t) ||
    /\bSMPTE[\s.]?ST[\s.]?2086\b/.test(t)
  ) {
    if (!t.includes("SDR")) return "HDR10";
  }

  // HLG
  if (t.includes("HLG")) {
    return "HLG";
  }

  return "SDR";
}

function parseDolbyVisionProfile(t: string): string | undefined {
  // Common profiles: 5, 7, 8.1, 8.4
  const profilePatterns = [
    /DV[.\s]?PROFILE[.\s]?(\d+\.?\d*)/i,
    /PROFILE[.\s]?(\d+\.?\d*)[.\s]?DV/i,
    /DV[.\s]?P(\d+\.?\d*)/i,
    /P(\d+\.?\d*)[.\s]?DV/i,
    /DOVI[.\s]?P(\d+\.?\d*)/i,
  ];

  for (const pattern of profilePatterns) {
    const match = t.match(pattern);
    if (match) {
      return `Profile ${match[1]}`;
    }
  }

  // Check for specific profile mentions without explicit pattern
  if (t.includes("DV") || t.includes("DOVI") || t.includes("DOLBY VISION")) {
    if (t.includes("8.4") || t.includes("84")) return "Profile 8.4";
    if (t.includes("8.1") || t.includes("81")) return "Profile 8.1";
    if (t.includes("P7") || t.match(/\b7\b/)) return "Profile 7";
    if (t.includes("P5") || t.match(/\b5\b/)) return "Profile 5";
  }

  return undefined;
}

function detectHDR(t: string): boolean {
  return (
    /\bHDR\b/.test(t) ||
    /[\[.\s]HDR[\].\s]/.test(t) ||
    detectDolbyVision(t) ||
    t.includes("HLG") ||
    t.includes("BT2020") ||
    t.includes("BT.2020") ||
    t.includes("BT 2020") ||
    t.includes("REC2020") ||
    t.includes("REC.2020") ||
    t.includes("REC 2020") ||
    /\bWCG\b/.test(t) ||
    /\bPQ\b/.test(t) ||
    /\bSMPTE[\s.]?2084\b/.test(t) ||
    /\bSMPTE[\s.]?ST[\s.]?2086\b/.test(t)
  );
}

function parseAudioCodec(t: string): string {
  // Dolby
  if (t.includes("TRUEHD") || t.includes("TRUE-HD") || t.includes("TRUE HD"))
    return "TrueHD";
  if (t.includes("ATMOS")) return "Atmos";
  if (
    t.includes("EAC3") ||
    t.includes("E-AC3") ||
    t.includes("E-AC-3") ||
    t.includes("DDP") ||
    t.includes("DD+")
  )
    return "DD+";
  if (
    t.includes("AC3") ||
    t.includes("AC-3") ||
    t.match(/\bDD\b/) ||
    t.includes("DOLBY DIGITAL")
  )
    return "AC3";

  // DTS
  if (
    t.includes("DTS-HD MA") ||
    t.includes("DTS-HDMA") ||
    t.includes("DTSHDMA")
  )
    return "DTS-HD MA";
  if (t.includes("DTS-HD") || t.includes("DTSHD")) return "DTS-HD";
  if (t.includes("DTS-X") || t.includes("DTSX")) return "DTS:X";
  if (t.match(/\bDTS\b/)) return "DTS";

  // Other
  if (t.includes("LPCM") || t.includes("PCM")) return "LPCM";
  if (t.includes("FLAC")) return "FLAC";
  if (t.includes("AAC")) return "AAC";
  if (t.includes("MP3")) return "MP3";
  if (t.includes("OPUS")) return "Opus";

  return "";
}

function parseAudioChannels(t: string): string {
  if (t.includes("7.1")) return "7.1";
  if (t.includes("5.1")) return "5.1";
  if (t.includes("2.1")) return "2.1";
  if (t.includes("2.0") || t.includes("STEREO")) return "2.0";
  if (t.includes("1.0") || t.includes("MONO")) return "1.0";
  return "";
}

function detectAtmos(t: string): boolean {
  return (
    t.includes("ATMOS") || t.includes("DD+ ATMOS") || t.includes("DDP ATMOS")
  );
}

function parseSource(t: string): string {
  // Streaming services
  if (t.includes("AMZN") || t.includes("AMAZON")) return "Amazon";
  if (t.includes("NF") || t.includes("NETFLIX")) return "Netflix";
  if (t.includes("DSNP") || t.includes("DISNEY+") || t.includes("DISNEY PLUS"))
    return "Disney+";
  if (
    t.includes("ATVP") ||
    t.includes("APPLE TV+") ||
    t.includes("APPLE TV PLUS")
  )
    return "Apple TV+";
  if (t.includes("HMAX") || t.includes("HBO MAX")) return "HBO Max";
  if (t.includes("HULU")) return "Hulu";
  if (t.includes("PCOK") || t.includes("PEACOCK")) return "Peacock";
  if (t.includes("PMTP") || t.includes("PARAMOUNT+")) return "Paramount+";

  // Physical/Broadcast
  if (t.includes("REMUX")) return "Remux";
  if (
    t.includes("BLURAY") ||
    t.includes("BLU-RAY") ||
    t.includes("BDRIP") ||
    t.includes("BRRIP")
  )
    return "BluRay";
  if (t.includes("UHD") && t.includes("BLURAY")) return "UHD BluRay";
  if (t.includes("WEB-DL") || t.includes("WEBDL")) return "WEB-DL";
  if (t.includes("WEBRIP") || t.includes("WEB-RIP")) return "WEBRip";
  if (t.includes("HDTV")) return "HDTV";
  if (t.includes("DVDRIP") || t.includes("DVD-RIP")) return "DVDRip";
  if (t.includes("DVDSCR")) return "DVDScr";
  if (t.includes("CAM") || t.includes("HDCAM")) return "CAM";
  if (t.includes("TS") || t.includes("TELESYNC") || t.includes("HDTS"))
    return "TS";

  return "";
}

function parseReleaseGroup(title: string): string {
  // Release group is typically at the end after a hyphen
  const match = title.match(/-([A-Za-z0-9]+)(?:\.[a-z]{2,4})?$/);
  if (match) {
    return match[1];
  }

  // Common release groups
  const groups = [
    "YIFY",
    "YTS",
    "RARBG",
    "SPARKS",
    "GECKOS",
    "FLUX",
    "NTb",
    "CMRG",
    "TEPES",
    "MONOLITH",
    "NOGRP",
    "EVO",
    "SMURF",
    "STUTTERSHIT",
    "SHITBOX",
    "EPSILON",
    "FGT",
    "PSA",
    "JYK",
    "ION10",
    "SWTYBLZ",
    "EMBER",
    "EDITH",
    "SURFINBIRD",
    "SYNCOPY",
    "PLAYNOW",
    "DEFLATE",
  ];

  for (const group of groups) {
    if (title.toUpperCase().includes(group)) {
      return group;
    }
  }

  return "";
}

function parseLanguages(t: string): string[] {
  const languages: string[] = [];

  const langPatterns: Record<string, string[]> = {
    English: ["ENGLISH", "ENG", "EN"],
    Spanish: ["SPANISH", "SPANISH LATINO", "LATINO", "ESP", "SPA"],
    French: ["FRENCH", "FRENCH AUDIO", "FRA", "FRE"],
    German: ["GERMAN", "DEUTSCH", "GER", "DEU"],
    Italian: ["ITALIAN", "ITA"],
    Portuguese: ["PORTUGUESE", "PORTUGUES", "POR"],
    Russian: ["RUSSIAN", "RUS"],
    Japanese: ["JAPANESE", "JAP", "JPN"],
    Korean: ["KOREAN", "KOR"],
    Chinese: ["CHINESE", "MANDARIN", "CANTONESE", "CHI", "CHN"],
    Hindi: ["HINDI", "HIN"],
    Arabic: ["ARABIC", "ARA"],
    Dutch: ["DUTCH", "DUT", "NLD"],
    Polish: ["POLISH", "POL"],
    Turkish: ["TURKISH", "TUR"],
    Multi: ["MULTI", "MULTI-AUDIO", "DUAL AUDIO", "DUAL-AUDIO"],
  };

  for (const [lang, patterns] of Object.entries(langPatterns)) {
    for (const pattern of patterns) {
      if (t.includes(pattern)) {
        if (!languages.includes(lang)) {
          languages.push(lang);
        }
        break;
      }
    }
  }

  return languages;
}

function detect3D(t: string): boolean {
  return (
    t.includes("3D") ||
    t.includes("HSBS") ||
    t.includes("HOU") ||
    t.includes("HALF-SBS") ||
    t.includes("HALF-OU")
  );
}

/**
 * Format file size from bytes to human readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get badge color for HDR type
 */
export function getHDRBadgeColor(hdrType: string): string {
  return BADGE_COLORS[hdrType as keyof typeof BADGE_COLORS] || BADGE_COLORS.SDR;
}

/**
 * Get badge color for resolution
 */
export function getResolutionBadgeColor(resolution: string): string {
  return (
    BADGE_COLORS[resolution as keyof typeof BADGE_COLORS] ||
    BADGE_COLORS["480p"]
  );
}

// ---------------------------------------------------------------------------
// Stream quality scoring — used to sort best results to the top
// ---------------------------------------------------------------------------

/** Compute a numeric quality score for a stream. Higher = better. */
export function scoreStream(name?: string, description?: string): number {
  const info = parseStreamInfo(name ?? "", description);
  let score = 0;

  // Resolution (dominant factor)
  switch (info.resolutionBadge) {
    case "4K":    score += 4000; break;
    case "1080p": score += 3000; break;
    case "720p":  score += 2000; break;
    case "480p":  score += 1000; break;
    default:      score += 500;  break;
  }

  // HDR bonuses
  if (info.hasDolbyVision) score += 300;
  if (info.hasHDR10Plus)   score += 250;
  if (info.isHDR && !info.hasDolbyVision && !info.hasHDR10Plus) score += 200;

  // Audio bonuses
  if (info.hasAtmos) score += 100;
  const audioOrder: Record<string, number> = {
    "TrueHD": 80, "DTS-HD MA": 75, "DTS:X": 70, "FLAC": 65,
    "DD+": 50, "DTS-HD": 45, "DTS": 40, "AC3": 30, "AAC": 20,
  };
  score += audioOrder[info.audioCodec] ?? 0;

  // Channels bonus
  if (info.audioChannels === "7.1") score += 15;
  else if (info.audioChannels === "5.1") score += 10;

  // Codec bonus (modern = better)
  if (info.videoCodec === "AV1") score += 25;
  else if (info.videoCodec === "HEVC") score += 20;

  // Source quality bonus
  if (info.isRemux) score += 50;
  if (info.source === "BluRay" || info.source === "UHD BluRay") score += 30;
  else if (info.source === "WEB-DL") score += 20;
  else if (info.source === "WEBRip") score += 10;

  return score;
}

/** Flattened stream with addon metadata for cross-addon sorting. */
export interface FlatStream {
  addonId: string;
  addonName: string;
  addonLogo?: string;
  stream: import("../services/addons/types").AddonStream;
  score: number;
}

/**
 * Flatten AddonStreamResult[] into a single sorted array (best quality first).
 * De-duplicates streams with the same URL/infoHash keeping the higher-scored one.
 */
export function sortStreamsByQuality(
  results: import("../stores/addonStore").AddonStreamResult[],
): FlatStream[] {
  const flat: FlatStream[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    for (const stream of r.streams) {
      const key =
        stream.url ??
        (stream.infoHash ? `magnet:${stream.infoHash}` : null);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      flat.push({
        addonId: r.addonId,
        addonName: r.addonName,
        addonLogo: r.addonLogo,
        stream,
        score: scoreStream(stream.name ?? stream.title, stream.description),
      });
    }
  }

  flat.sort((a, b) => b.score - a.score);
  return flat;
}
