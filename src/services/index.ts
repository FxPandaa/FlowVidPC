export { cinemetaService } from "./metadata";
export { tmdbService } from "./metadata";
export type {
  MediaItem,
  MovieDetails,
  SeriesDetails,
  Episode,
  TmdbEnrichedData,
  TmdbCastMember,
  TmdbCrewMember,
  TmdbTrailer,
  TmdbProductionCompany,
  TmdbNetwork,
  TmdbRecommendation,
  TmdbPersonDetails,
  TmdbPersonCredit,
  TmdbEpisodeRating,
  TmdbDiscoverItem,
} from "./metadata";

export { fetchManifest, fetchStreams, getAddonBaseUrl } from "./addons";
export type { AddonManifest, AddonStream, AddonStreamsResponse, InstalledAddon } from "./addons";

export { openSubtitlesService } from "./subtitles";
export type { Subtitle, SubtitleSearchParams } from "./subtitles";
export { createSubtitleBlobUrl, adjustSubtitleTiming } from "./subtitles";

export { embeddedMpvService } from "./embeddedMpvService";
export type {
  AudioTrack as EmbeddedAudioTrack,
  SubtitleTrack as EmbeddedSubtitleTrack,
  EmbeddedPlayerState,
} from "./embeddedMpvService";

export { skipIntroService } from "./skipIntro";
export type { SkipSegment } from "./skipIntro";
