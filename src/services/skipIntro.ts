/**
 * Skip Intro / Outro service.
 *
 * Primary:  IntroDB     — https://api.introdb.app
 *           Covers intro, outro, recap for most TV shows.
 *           Uses IMDb IDs natively. Community-verified timestamps.
 *
 * Fallback: AniSkip     — https://api.aniskip.com
 *           Covers anime openings / endings; uses MAL IDs but
 *           also exposes an IMDb bridge endpoint.
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const INTRODB_BASE = "https://api.introdb.app";
const ANISKIP_BASE = "https://api.aniskip.com";

// ── Public types ────────────────────────────────────────────────────────

export interface SkipSegment {
  type: "intro" | "outro" | "recap" | "mixed-intro" | "mixed-outro";
  startTime: number; // seconds
  endTime: number;   // seconds
  source: "introdb" | "aniskip";
}

// ── Raw response shapes ─────────────────────────────────────────────────

interface IntroDbSegment {
  start_sec: number;
  end_sec: number;
  start_ms: number;
  end_ms: number;
  confidence: number;
  submission_count: number;
  updated_at: string;
}

interface IntroDbResponse {
  imdb_id: string;
  season: number;
  episode: number;
  intro: IntroDbSegment | null;
  recap: IntroDbSegment | null;
  outro: IntroDbSegment | null;
}

interface AniSkipResult {
  found: boolean;
  results?: {
    interval: { startTime: number; endTime: number };
    skipType: string; // "op" | "ed" | "recap" | "mixed-ed" | "mixed-op"
  }[];
}

// ── Service ─────────────────────────────────────────────────────────────

class SkipIntroService {
  private cache = new Map<string, { data: SkipSegment[]; ts: number }>();
  private static CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

  async getSkipSegments(
    imdbId: string,
    season: number,
    episode: number,
    _episodeLength?: number,
  ): Promise<SkipSegment[]> {
    const key = `${imdbId}:${season}:${episode}`;

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < SkipIntroService.CACHE_TTL) {
      return cached.data;
    }

    let segments: SkipSegment[] = [];

    try {
      segments = await this.fetchFromIntroDB(imdbId, season, episode);
    } catch { /* fall through */ }

    // If IntroDB found nothing, try AniSkip (good for anime)
    if (segments.length === 0) {
      try {
        segments = await this.fetchFromAniSkip(imdbId, episode);
      } catch { /* ignore */ }
    }

    this.cache.set(key, { data: segments, ts: Date.now() });
    return segments;
  }

  async hasIntro(imdbId: string, season: number, episode: number): Promise<boolean> {
    const segs = await this.getSkipSegments(imdbId, season, episode);
    return segs.some((s) => s.type === "intro" || s.type === "mixed-intro");
  }

  async getIntro(imdbId: string, season: number, episode: number): Promise<SkipSegment | null> {
    const segs = await this.getSkipSegments(imdbId, season, episode);
    return segs.find((s) => s.type === "intro" || s.type === "mixed-intro") ?? null;
  }

  // ── IntroDB ──────────────────────────────────────────────────────────

  private async fetchFromIntroDB(
    imdbId: string,
    season: number,
    episode: number,
  ): Promise<SkipSegment[]> {
    try {
      const url = `${INTRODB_BASE}/segments?imdb_id=${encodeURIComponent(imdbId)}&season=${season}&episode=${episode}`;
      const res = await tauriFetch(url, { method: "GET", connectTimeout: 5000 });
      if (!res.ok) return [];

      const data: IntroDbResponse = await res.json();
      const segments: SkipSegment[] = [];

      if (data.intro && data.intro.end_sec > data.intro.start_sec) {
        segments.push({
          type: "intro",
          startTime: data.intro.start_sec,
          endTime: data.intro.end_sec,
          source: "introdb",
        });
      }
      if (data.recap && data.recap.end_sec > data.recap.start_sec) {
        segments.push({
          type: "recap",
          startTime: data.recap.start_sec,
          endTime: data.recap.end_sec,
          source: "introdb",
        });
      }
      if (data.outro && data.outro.end_sec > data.outro.start_sec) {
        segments.push({
          type: "outro",
          startTime: data.outro.start_sec,
          endTime: data.outro.end_sec,
          source: "introdb",
        });
      }

      return segments;
    } catch {
      return [];
    }
  }

  // ── AniSkip ──────────────────────────────────────────────────────────

  private async fetchFromAniSkip(
    imdbId: string,
    episodeNumber: number,
  ): Promise<SkipSegment[]> {
    try {
      // AniSkip has an IMDb bridge: GET /v2/skip-times/imdb/{imdbId}/{episodeNumber}
      const url = `${ANISKIP_BASE}/v2/skip-times/imdb/${imdbId}/${episodeNumber}?types[]=op&types[]=ed&types[]=recap&types[]=mixed-op&types[]=mixed-ed`;
      const res = await tauriFetch(url, { method: "GET", connectTimeout: 5000 });
      if (!res.ok) return [];

      const data: AniSkipResult = await res.json();
      if (!data.found || !data.results) return [];

      return data.results.map((r) => ({
        type: this.normalizeType(r.skipType),
        startTime: r.interval.startTime,
        endTime: r.interval.endTime,
        source: "aniskip" as const,
      }));
    } catch {
      return [];
    }
  }

  private normalizeType(raw: string): SkipSegment["type"] {
    const lower = raw.toLowerCase();
    if (lower === "op" || lower.includes("intro") || lower === "mixed-op") return "intro";
    if (lower === "ed" || lower.includes("outro") || lower === "mixed-ed") return "outro";
    if (lower.includes("recap")) return "recap";
    return "intro"; // default to intro
  }
}

export const skipIntroService = new SkipIntroService();
