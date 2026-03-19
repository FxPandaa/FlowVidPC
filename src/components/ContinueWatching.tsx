import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { WatchHistoryItem, useLibraryStore } from "../stores/libraryStore";
import { useValidatedImage } from "../utils/useValidatedImage";
import { Film, Tv, Play, X, ChevronLeft, ChevronRight } from "./Icons";
import "./ContinueWatching.css";

interface ContinueWatchingProps {
  items: WatchHistoryItem[];
}

export function ContinueWatching({ items }: ContinueWatchingProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => setScrolled(el.scrollLeft > 2);
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (listRef.current) {
      const scrollAmount = listRef.current.clientWidth * 0.8;
      listRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="continue-watching">
      <div className="continue-watching-header">
        <h2>Continue Watching</h2>
      </div>
      <div className="continue-watching-scroll-wrapper">
        <button
          className="continue-scroll-btn continue-scroll-left"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
        >
          <ChevronLeft size={18} />
        </button>
        <div className={`continue-watching-list${scrolled ? " cw-scrolled" : ""}`} ref={listRef}>
          {items.slice(0, 10).map((item) => (
            <ContinueWatchingCard key={item.id} item={item} />
          ))}
        </div>
        <button
          className="continue-scroll-btn continue-scroll-right"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item }: { item: WatchHistoryItem }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [posterError, setPosterError] = useState(false);
  // Always construct a reliable MetaHub poster URL from the IMDB ID
  const metahubPoster = item.imdbId ? `https://images.metahub.space/poster/medium/${item.imdbId}/img` : null;
  // Use stored poster if available, otherwise fall back to MetaHub
  const posterUrl = item.poster || metahubPoster;
  const validatedPoster = useValidatedImage(posterUrl);
  const { removeFromHistory } = useLibraryStore();
  const navigate = useNavigate();

  const isUpNext = item.progress === 0 && item.type === "series";

  const remainingMinutes = item.duration > 0
    ? Math.ceil((item.duration * (100 - item.progress)) / 100 / 60)
    : 0;

  const playerUrl =
    item.type === "movie"
      ? `/player/movie/${item.imdbId}`
      : `/player/series/${item.imdbId}/${item.season}/${item.episode}`;

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Always navigate directly — use last stream URL if available
    navigate(playerUrl, {
      state: item.streamUrl ? { streamUrl: item.streamUrl } : undefined,
    });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(item.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="continue-card-wrapper">
      <div
        className="continue-card"
        onClick={handleCardClick}
        style={{ cursor: "pointer" }}
      >
        <div className="continue-card-poster">
          {validatedPoster && !posterError ? (
            <img
              src={validatedPoster}
              alt={item.title}
              onError={() => setPosterError(true)}
            />
          ) : metahubPoster && posterError ? (
            <img
              src={metahubPoster}
              alt={item.title}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <div className="continue-card-placeholder">
              {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
            </div>
          )}
          <div className="continue-card-overlay">
            <span className="play-button">
              <Play size={20} />
            </span>
          </div>
          {item.type === "series" && item.season && item.episode && (
            <span className="continue-card-season-tag">
              S{item.season}E{item.episode}
            </span>
          )}
          <span className="continue-card-percent">
            {isUpNext ? "Up Next" : `${Math.round(item.progress)}%`}
          </span>
          {!isUpNext && (
            <div className="continue-progress">
              <div
                className="continue-progress-fill"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}
          <button
            className="delete-button"
            onClick={handleDeleteClick}
            title="Remove from Continue Watching"
          >
            <X size={14} />
          </button>
        </div>
        <div className="continue-card-info">
          <h3 className="continue-card-title">{item.title || item.imdbId}</h3>
          {item.type === "series" && item.season && item.episode && (
            <span className="continue-card-episode">
              S{item.season}:E{item.episode}
              {item.episodeTitle && ` - ${item.episodeTitle}`}
            </span>
          )}
          <span className="continue-card-remaining">
            {isUpNext ? "New episode" : `${remainingMinutes} min remaining`}
          </span>
        </div>
      </div>

      {showDeleteConfirm
        ? createPortal(
            <div
              className="delete-confirm-overlay"
              onClick={handleCancelDelete}
            >
              <div
                className="delete-confirm-popup"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Remove from Continue Watching?</h3>
                <p>This will delete your progress for "{item.title}"</p>
                <div className="delete-confirm-buttons">
                  <button
                    className="btn btn-ghost"
                    onClick={handleCancelDelete}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleConfirmDelete}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
