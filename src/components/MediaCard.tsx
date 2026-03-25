import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import { rememberValidatedImageResult, useValidatedImage } from "../utils/useValidatedImage";
import { Film, Tv, Play, StarFilled, Check, X } from "./Icons";
import "./MediaCard.css";

interface MediaCardProps {
  item: MediaItem;
  size?: "small" | "medium" | "large";
  variant?: "poster" | "landscape";
  showRating?: boolean;
  watched?: boolean;
  onRemove?: (id: string) => void;
}

export function MediaCard({
  item,
  size = "medium",
  variant = "poster",
  showRating = true,
  watched = false,
  onRemove,
}: MediaCardProps) {
  const linkPath = `/details/${item.type}/${item.id}`;
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [runtimeLogoError, setRuntimeLogoError] = useState(false);
  const [runtimePosterError, setRuntimePosterError] = useState(false);
  const [runtimeBackdropError, setRuntimeBackdropError] = useState(false);

  // Only validate images needed for the current variant.
  // Poster mode: only needs poster.  Landscape mode: needs backdrop + logo.
  // Passing null avoids triggering a tauriFetch for unused images.
  const validatedPoster = useValidatedImage(
    variant === "poster" ? (item.poster || null) : null,
  );
  const validatedLogo = useValidatedImage(
    variant === "landscape" ? (item.logo || null) : null,
  );
  const validatedBackdrop = useValidatedImage(
    variant === "landscape"
      ? ((item.backdrop || item.background || item.poster) ?? null)
      : null,
  );

  if (variant === "landscape") {
    const bgImage = runtimeBackdropError ? null : validatedBackdrop;

    return (
      <Link
        to={linkPath}
        className={`media-card media-card-landscape media-card-landscape-${size}`}
      >
        <div className="media-card-landscape-image">
          {bgImage ? (
            <img
              src={bgImage}
              alt={item.title}
              loading="lazy"
              onError={() => {
                rememberValidatedImageResult(bgImage, false);
                setRuntimeBackdropError(true);
              }}
            />
          ) : (
            <div className="media-card-placeholder">
              <span>
                {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
              </span>
            </div>
          )}

          <div className="media-card-landscape-gradient"></div>

          {/* Logo overlay */}
          {validatedLogo && !runtimeLogoError ? (
            <div className="media-card-logo">
              <img
                src={validatedLogo}
                alt={item.title}
                onError={() => {
                  rememberValidatedImageResult(validatedLogo, false);
                  setRuntimeLogoError(true);
                }}
              />
            </div>
          ) : (
            <div className="media-card-logo-text">
              <h3>{item.title}</h3>
            </div>
          )}

          <div className="media-card-overlay">
            <button className="play-btn">
              <Play size={20} />
            </button>
          </div>

          {showRating && item.rating > 0 && (
            <div className="media-card-rating">
              <span className="star">
                <StarFilled size={12} />
              </span>
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="media-card-landscape-meta">
          <span className="year">{item.year || item.releaseInfo || "TBA"}</span>
          <span className="dot">·</span>
          <span className="type">
            {item.type === "movie" ? "Movie" : "Series"}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link to={linkPath} className={`media-card media-card-${size}`}>
      <div className="media-card-poster">
        {validatedPoster && !runtimePosterError ? (
          <img
            src={validatedPoster}
            alt={item.title}
            loading="lazy"
            onError={() => {
              rememberValidatedImageResult(validatedPoster, false);
              setRuntimePosterError(true);
            }}
          />
        ) : (
          <div className="media-card-placeholder">
            <span>
              {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
            </span>
          </div>
        )}

        <div className="media-card-overlay">
          <button className="play-btn">
            <Play size={20} />
          </button>
        </div>

        {showRating && item.rating > 0 && (
          <div className="media-card-rating">
            <span className="star">
              <StarFilled size={12} />
            </span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}

        {watched && (
          <div className="media-card-watched-badge">
            <Check size={14} />
          </div>
        )}

        {onRemove && (
          <button
            className="media-card-remove-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowRemoveConfirm(true);
            }}
            title="Remove from Library"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="media-card-info">
        <h3 className="media-card-title">{item.title}</h3>
        <div className="media-card-meta">
          <span className="year">{item.year || item.releaseInfo || "TBA"}</span>
          <span className="type">
            {item.type === "movie" ? "Movie" : "Series"}
          </span>
        </div>
      </div>

      {showRemoveConfirm && onRemove && createPortal(
        <div className="delete-confirm-overlay" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRemoveConfirm(false); }}>
          <div className="delete-confirm-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Remove from Library?</h3>
            <p>This will remove &ldquo;{item.title}&rdquo; from your library.</p>
            <div className="delete-confirm-buttons">
              <button className="btn btn-ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRemoveConfirm(false); }}>Cancel</button>
              <button className="btn btn-danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(item.id); setShowRemoveConfirm(false); }}>Remove</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Link>
  );
}
