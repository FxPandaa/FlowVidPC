import { useState } from "react";
import { createPortal } from "react-dom";
import { useLibraryStore } from "../stores";
import { MediaCard, ContinueWatching } from "../components";
import {
  StarFilled,
  Clipboard,
  Search,
  BookOpen,
} from "../components/Icons";
import { MediaItem } from "../services";
import "./LibraryPage.css";

export function LibraryPage() {
  const {
    library,
    watchHistory,
    activeFilter,
    sortBy,
    setFilter,
    setSortBy,
    getFilteredLibrary,
    clearWatchHistory,
    removeFromLibrary,
  } = useLibraryStore();

  const filteredLibrary = getFilteredLibrary();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Convert library items to MediaItem format for cinemeta
  const libraryItems: MediaItem[] = filteredLibrary.map((item) => ({
    id: item.imdbId,
    imdbId: item.imdbId,
    type: item.type,
    name: item.title,
    title: item.title,
    year: item.year,
    description: "",
    overview: "",
    poster: item.poster,
    background: item.backdrop,
    backdrop: item.backdrop,
    rating: item.rating || 0,
    genres: [],
  }));

  // Deduplicated continue watching (most recent episode per series)
  const continueItems = watchHistory
    .filter((item, index, self) => {
      // Skip finished items (≥95% watched)
      if (item.progress >= 95) return false;
      if (item.type === "movie") return true;
      return self.findIndex((h) => h.imdbId === item.imdbId) === index;
    })
    .slice(0, 10);

  return (
    <div className="library-page">
      {/* Header + controls */}
      <div className="library-top">
        <h1>My Library</h1>
        <div className="library-controls">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-btn ${activeFilter === "movies" ? "active" : ""}`}
              onClick={() => setFilter("movies")}
            >
              Movies
            </button>
            <button
              className={`filter-btn ${activeFilter === "series" ? "active" : ""}`}
              onClick={() => setFilter("series")}
            >
              Series
            </button>
            <button
              className={`filter-btn ${activeFilter === "favorites" ? "active" : ""}`}
              onClick={() => setFilter("favorites")}
            >
              <StarFilled size={14} /> Favorites
            </button>
            <button
              className={`filter-btn ${activeFilter === "watchlist" ? "active" : ""}`}
              onClick={() => setFilter("watchlist")}
            >
              <Clipboard size={14} /> Watchlist
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="sort-select"
          >
            <option value="recent">Recently Added</option>
            <option value="title">Title (A-Z)</option>
            <option value="rating">Rating</option>
            <option value="year">Year</option>
            <option value="runtime">Runtime</option>
          </select>
        </div>
      </div>

      {/* Stacked layout: Continue Watching on top, Library below */}
      <div className="library-sections">
        {/* Continue Watching — same vertical poster cards as homepage */}
        {continueItems.length > 0 && (
          <div className="library-cw-section">
            <div className="library-cw-header">
              <span />  {/* spacer — ContinueWatching has its own h2 */}
              <button className="btn btn-ghost" onClick={() => setShowClearConfirm(true)}>
                Clear
              </button>
            </div>
            <ContinueWatching items={continueItems} />
          </div>
        )}

        {showClearConfirm && createPortal(
          <div className="delete-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
            <div className="delete-confirm-popup" onClick={(e) => e.stopPropagation()}>
              <h3>Clear Continue Watching?</h3>
              <p>All watch progress will be removed.</p>
              <div className="delete-confirm-buttons">
                <button className="btn btn-ghost" onClick={() => setShowClearConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => { clearWatchHistory(); setShowClearConfirm(false); }}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* Library grid */}
        <div className="library-grid-section">
          <div className="library-grid-header">
            <h2>Library</h2>
            <span className="library-count">
              {filteredLibrary.length}{" "}
              {filteredLibrary.length === 1 ? "item" : "items"}
            </span>
          </div>

          {libraryItems.length > 0 ? (
            <div className="library-grid">
              {libraryItems.map((item) => {
                const libItem = filteredLibrary.find((l) => l.imdbId === item.id);
                return (
                  <MediaCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    size="medium"
                    watched={libItem?.watched}
                    onRemove={(id) => removeFromLibrary(id)}
                  />
                );
              })}
            </div>
          ) : library.length > 0 ? (
            <div className="library-empty">
              <span className="empty-icon">
                <Search size={40} />
              </span>
              <h2>No items match your filters</h2>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="library-empty">
              <span className="empty-icon">
                <BookOpen size={40} />
              </span>
              <h2>Your library is empty</h2>
              <p>Add movies and shows to your library to watch them later</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
