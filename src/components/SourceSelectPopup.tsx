import { createPortal } from "react-dom";
import type { AddonStreamResult } from "../stores/addonStore";
import { useSettingsStore } from "../stores";
import { parseStreamInfo, sortStreamsByQuality } from "../utils/streamParser";
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
  const { streamSorting } = useSettingsStore();
  const totalStreams = streams.reduce((n, r) => n + r.streams.length, 0);

  // Build a flat, potentially sorted list of stream cards
  const renderStreams = () => {
    if (streamSorting === "quality") {
      const sorted = sortStreamsByQuality(streams);
      return sorted.map((item, i) => {
        const streamTitle = item.stream.name ?? item.stream.title ?? "";
        const info = parseStreamInfo(streamTitle, item.stream.description);
        const streamUrl =
          item.stream.url ??
          (item.stream.infoHash
            ? `magnet:?xt=urn:btih:${item.stream.infoHash}`
            : null);
        if (!streamUrl) return null;
        return (
          <div
            key={`sorted-${i}`}
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
                  {streamTitle || item.stream.description || "Stream"}
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
                </div>
              </div>
            </div>
            <div className="source-card-right">
              <div className="source-addon-info">
                {item.addonLogo && (
                  <img
                    src={item.addonLogo}
                    alt=""
                    className="source-addon-logo"
                  />
                )}
                <span className="source-addon-name">{item.addonName}</span>
              </div>
              <button
                className="btn btn-primary btn-sm source-play-btn"
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
      });
    }

    // "addon" mode — keep original per-addon grouping
    return streams.flatMap((addonResult) =>
      addonResult.streams.map((stream, si) => {
        const streamTitle = stream.name ?? stream.title ?? "";
        const info = parseStreamInfo(streamTitle, stream.description);
        const streamUrl =
          stream.url ??
          (stream.infoHash
            ? `magnet:?xt=urn:btih:${stream.infoHash}`
            : null);
        if (!streamUrl) return null;
        return (
          <div
            key={`${addonResult.addonId}-${si}`}
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
                  {streamTitle || stream.description || "Stream"}
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
                </div>
              </div>
            </div>
            <div className="source-card-right">
              <div className="source-addon-info">
                {addonResult.addonLogo && (
                  <img
                    src={addonResult.addonLogo}
                    alt=""
                    className="source-addon-logo"
                  />
                )}
                <span className="source-addon-name">
                  {addonResult.addonName}
                </span>
              </div>
              <button
                className="btn btn-primary btn-sm source-play-btn"
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
