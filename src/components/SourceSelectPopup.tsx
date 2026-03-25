import { createPortal } from "react-dom";
import type { AddonStreamResult } from "../stores/addonStore";
import { useSettingsStore } from "../stores";
import { parseStreamInfo, sortStreamsByQuality, type StreamInfo, LANGUAGE_FLAGS } from "../utils/streamParser";
import {
  Play,
  X,
  DolbyVisionBadge,
  HDR10Badge,
  HDR10PlusBadge,
  DolbyAtmosBadge,
  HDRBadge,
} from "./Icons";
import "./SourceSelectPopup.css";

interface SourceSelectPopupProps {
  /** Title shown at the top of the popup (movie title or "S1E3 — Episode Name") */
  title: string;
  /** Stream results grouped by addon */
  streams: AddonStreamResult[];
  /** Whether streams are still loading */
  isLoading: boolean;
  /** Names of addons that haven't responded yet */
  pendingAddons?: string[];
  /** Called when a stream is selected */
  onSelectStream: (streamUrl: string) => void;
  /** Called when the popup is closed */
  onClose: () => void;
}

export function SourceSelectPopup({
  title,
  streams,
  isLoading,
  pendingAddons = [],
  onSelectStream,
  onClose,
}: SourceSelectPopupProps) {
  const { streamSorting, streamDetailMode } = useSettingsStore();
  const totalStreams = streams.reduce((n, r) => n + r.streams.length, 0);

  const renderDetailBadges = (info: StreamInfo) => {
    // Filter out English (assumed default) — only show non-English languages
    const displayLangs = info.languages.filter((l) => l !== "English");
    return (
      <div className="source-detail-badges">
        {info.hasDolbyVision && <DolbyVisionBadge height={16} />}
        {info.hasHDR10Plus && <HDR10PlusBadge height={16} />}
        {info.isHDR &&
          !info.hasDolbyVision &&
          !info.hasHDR10Plus &&
          (info.hdrType === "HDR10" ? (
            <HDR10Badge height={16} />
          ) : (
            <HDRBadge height={16} />
          ))}
        {info.hasAtmos && <DolbyAtmosBadge height={16} />}
        {info.videoCodec && <span className="source-tag">{info.videoCodec}</span>}
        {info.audioCodec && info.audioCodec !== "Atmos" && <span className="source-tag">{info.audioCodec}</span>}
        {info.audioChannels && info.audioChannels !== "Unknown" && <span className="source-tag">{info.audioChannels}</span>}
        {info.source && info.source !== "Remux" && <span className="source-tag">{info.source}</span>}
        {info.fileSize && <span className="source-tag source-tag-size">{info.fileSize}</span>}
        {info.isRemux && <span className="source-tag source-tag-remux">Remux</span>}
        {displayLangs.length > 0 && displayLangs.map((lang) => (
          <span key={lang} className="source-tag source-tag-lang" title={lang}>
            {LANGUAGE_FLAGS[lang] || lang}
          </span>
        ))}
      </div>
    );
  };

  const renderCard = (
    key: string,
    streamTitle: string,
    description: string | undefined,
    info: StreamInfo,
    streamUrl: string,
    addonName: string,
    addonLogo?: string,
    originalSourceText?: string,
  ) => {
    if (streamDetailMode) {
      return (
        <div
          key={key}
          className="source-card source-card-detailed"
          onClick={() => onSelectStream(streamUrl)}
        >
          <div className="source-card-left">
            <div className="source-quality-col">
              <span
                className={`source-res-badge ${info.resolutionBadge === "4K" ? "res-4k" : info.resolutionBadge === "1080p" ? "res-1080p" : "res-other"}`}
              >
                {info.resolutionBadge}
              </span>
            </div>
            <div className="source-details-col">
              <span className="source-stream-title source-stream-title-full">
                {streamTitle || description || "Stream"}
              </span>
              {description && streamTitle && (
                <span className="source-stream-desc">{description}</span>
              )}
              {originalSourceText && (
                <span className="source-original-text">{originalSourceText}</span>
              )}
              {renderDetailBadges(info)}
              {info.releaseGroup && (
                <span className="source-release-group">{info.releaseGroup}</span>
              )}
            </div>
          </div>
          <div className="source-card-right">
            <div className="source-addon-info">
              {addonLogo && (
                <img
                  src={addonLogo}
                  alt=""
                  className="source-addon-logo"
                />
              )}
              <span className="source-addon-name">{addonName}</span>
            </div>
            <button
              className="btn btn-secondary btn-sm source-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectStream(streamUrl);
              }}
            >
              <Play size={12} /> Play
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={key}
        className="source-card"
        onClick={() => onSelectStream(streamUrl)}
      >
        <div className="source-card-left">
          <div className="source-quality-col">
            <span
              className={`source-res-badge ${info.resolutionBadge === "4K" ? "res-4k" : info.resolutionBadge === "1080p" ? "res-1080p" : "res-other"}`}
            >
              {info.resolutionBadge}
            </span>
          </div>
          <div className="source-details-col">
            <span className="source-stream-title">
              {streamTitle || description || "Stream"}
            </span>
            <div className="source-badges">
              {info.hasDolbyVision && <DolbyVisionBadge height={16} />}
              {info.hasHDR10Plus && <HDR10PlusBadge height={16} />}
              {info.isHDR &&
                !info.hasDolbyVision &&
                !info.hasHDR10Plus &&
                (info.hdrType === "HDR10" ? (
                  <HDR10Badge height={16} />
                ) : (
                  <HDRBadge height={16} />
                ))}
              {info.hasAtmos && <DolbyAtmosBadge height={16} />}
              {info.fileSize && <span className="source-tag source-tag-size">{info.fileSize}</span>}
            </div>
          </div>
        </div>
        <div className="source-card-right">
          <div className="source-addon-info">
            {addonLogo && (
              <img
                src={addonLogo}
                alt=""
                className="source-addon-logo"
              />
            )}
            <span className="source-addon-name">{addonName}</span>
          </div>
          <button
            className="btn btn-secondary btn-sm source-play-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSelectStream(streamUrl);
            }}
          >
            <Play size={12} /> Play
          </button>
        </div>
      </div>
    );
  };

  // Build a flat, potentially sorted list of stream cards
  const renderStreams = () => {
    if (streamSorting === "quality") {
      const sorted = sortStreamsByQuality(streams);
      return sorted.map((item, i) => {
        const streamTitle = item.stream.name ?? item.stream.title ?? "";
        const allText = [item.stream.name, item.stream.title, item.stream.description, item.stream.behaviorHints?.bingeGroup?.replace(/\|/g, " ")].filter(Boolean).join(" ");
        const info = parseStreamInfo(streamTitle, allText);
        // Build original source text: prefer title if different from name, else description first line
        const rawSource = (item.stream.title && item.stream.title !== item.stream.name)
          ? item.stream.title
          : item.stream.description?.split("\n")[0] || "";
        const streamUrl =
          item.stream.url ??
          (item.stream.infoHash
            ? `magnet:?xt=urn:btih:${item.stream.infoHash}`
            : null);
        if (!streamUrl) return null;
        return renderCard(
          `sorted-${i}`,
          streamTitle,
          item.stream.description,
          info,
          streamUrl,
          item.addonName,
          item.addonLogo,
          streamDetailMode ? rawSource : undefined,
        );
      });
    }

    // "addon" mode — keep original per-addon grouping
    return streams.flatMap((addonResult) =>
      addonResult.streams.map((stream, si) => {
        const streamTitle = stream.name ?? stream.title ?? "";
        const allText = [stream.name, stream.title, stream.description, stream.behaviorHints?.bingeGroup?.replace(/\|/g, " ")].filter(Boolean).join(" ");
        const info = parseStreamInfo(streamTitle, allText);
        const rawSource = (stream.title && stream.title !== stream.name)
          ? stream.title
          : stream.description?.split("\n")[0] || "";
        const streamUrl =
          stream.url ??
          (stream.infoHash
            ? `magnet:?xt=urn:btih:${stream.infoHash}`
            : null);
        if (!streamUrl) return null;
        return renderCard(
          `${addonResult.addonId}-${si}`,
          streamTitle,
          stream.description,
          info,
          streamUrl,
          addonResult.addonName,
          addonResult.addonLogo,
          streamDetailMode ? rawSource : undefined,
        );
      }),
    );
  };

  return createPortal(
    <div className="source-popup-backdrop" onClick={onClose}>
      <div className="source-popup" onClick={(e) => e.stopPropagation()}>
        <div className="source-popup-header">
          <div>
            <div className="source-popup-title">{title}</div>
            <div className="source-popup-subtitle">
              {isLoading && <span className="source-loading-dot" />}
              {isLoading
                ? totalStreams > 0
                  ? `${totalStreams} stream${totalStreams !== 1 ? "s" : ""} found — loading ${pendingAddons.length > 0 ? pendingAddons.join(", ") : "more"}...`
                  : pendingAddons.length > 0
                    ? `Fetching from ${pendingAddons.join(", ")}...`
                    : "Fetching streams from addons..."
                : totalStreams > 0
                  ? `${totalStreams} stream${totalStreams !== 1 ? "s" : ""} found`
                  : "No streams found"}
            </div>
          </div>
          <button className="source-popup-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {isLoading && totalStreams === 0 && (
          <div className="source-popup-loading">
            <div className="spinner"></div>
            <span>Querying addons...</span>
          </div>
        )}

        {!isLoading && totalStreams === 0 && (
          <div className="source-popup-empty">
            No streams found. Make sure you have addons installed and enabled.
          </div>
        )}

        {totalStreams > 0 && (
          <div className="source-popup-list">
            {renderStreams()}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
