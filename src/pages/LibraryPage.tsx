import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLibraryStore } from "../stores";
import { MediaCard, ContinueWatching } from "../components";
import {
  StarFilled,
  Clipboard,
  Search,
  BookOpen,
  Check,
} from "../components/Icons";
import { MediaItem } from "../services";
import "./LibraryPage.css";

const SORT_OPTIONS = [
  { value: "recent", label: "Recently Added" },
  { value: "title", label: "Title (A-Z)" },
  { value: "rating", label: "Rating" },
  { value: "year", label: "Year" },
  { value: "runtime", label: "Runtime" },
];

export function LibraryPage() {
  const {
    library,
    watchHistory,
    typeFilter,
    statusFilter,
    sortBy,
    setTypeFilter,
    setStatusFilter,
    setSortBy,
    getFilteredLibrary,
    clearWatchHistory,
    removeFromLibrary,
  } = useLibraryStore();

  const filteredLibrary = getFilteredLibrary();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortDropdownOpen]);

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
          <div className="library-filter-rows">
            <div className="filter-buttons">
              <button
                className={`filter-btn ${typeFilter === "all" ? "active" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                All
              </button>
              <button
                className={`filter-btn ${typeFilter === "movies" ? "active" : ""}`}
                onClick={() => setTypeFilter("movies")}
              >
                Movies
              </button>
              <button
                className={`filter-btn ${typeFilter === "series" ? "active" : ""}`}
                onClick={() => setTypeFilter("series")}
              >
                Series
              </button>
            </div>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All Status
              </button>
              <button
                className={`filter-btn ${statusFilter === "favorites" ? "active" : ""}`}
                onClick={() => setStatusFilter("favorites")}
              >
                <StarFilled size={14} /> Favorites
              </button>
              <button
                className={`filter-btn ${statusFilter === "watchlist" ? "active" : ""}`}
                onClick={() => setStatusFilter("watchlist")}
              >
                <Clipboard size={14} /> Watchlist
              </button>
              <button
                className={`filter-btn ${statusFilter === "watched" ? "active" : ""}`}
                onClick={() => setStatusFilter("watched")}
              >
                <Check size={14} /> Watched
              </button>
              <button
                className={`filter-btn ${statusFilter === "unwatched" ? "active" : ""}`}
                onClick={() => setStatusFilter("unwatched")}
              >
                Unwatched
              </button>
            </div>
          </div>

          <div className="library-sort-dropdown" ref={sortDropdownRef}>
            <button
              className={`library-sort-trigger ${sortDropdownOpen ? "open" : ""}`}
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            >
              <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Recently Added"}</span>
              <svg className="dropdown-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {sortDropdownOpen && (
              <div className="library-sort-menu">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`library-sort-option ${sortBy === opt.value ? "selected" : ""}`}
                    onClick={() => { setSortBy(opt.value as any); setSortDropdownOpen(false); }}
                  >
                    <span className="sort-check">
                      {sortBy === opt.value && <Check size={12} />}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
