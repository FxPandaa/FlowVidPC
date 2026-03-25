import { useState, useEffect, useMemo } from "react";
import { HeroBanner, MediaRow, ContinueWatching } from "../components";
import { cinemetaService, MediaItem } from "../services";
import { useLibraryStore, useSettingsStore } from "../stores";
import { ForYouRow } from "../components/ForYouRow";
import "./HomePage.css";

/**
 * Module-level data cache so navigating away and back
 * doesn't flash a skeleton / re-fetch everything.
 */
let _cachedPopularMovies: MediaItem[] = [];
let _cachedPopularSeries: MediaItem[] = [];
let _cachedTopRatedMovies: MediaItem[] = [];
let _cachedTopRatedSeries: MediaItem[] = [];
let _homeCacheTimestamp = 0;

const HOME_CACHE_TTL_MS = 10 * 60 * 1000;

export function HomePage() {
  const [popularMovies, setPopularMovies] =
    useState<MediaItem[]>(_cachedPopularMovies);
  const [popularSeries, setPopularSeries] =
    useState<MediaItem[]>(_cachedPopularSeries);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>(
    _cachedTopRatedMovies,
  );
  const [topRatedSeries, setTopRatedSeries] = useState<MediaItem[]>(
    _cachedTopRatedSeries,
  );

  // Only show loading on very first load (no cached data)
  const hasCachedData = _cachedPopularMovies.length > 0;
  const [isLoading, setIsLoading] = useState(!hasCachedData);

  const { watchHistory } = useLibraryStore();
  const { showForYou } = useSettingsStore();

  // Build the top 10 featured items from popular movies + series
  const featuredItems = useMemo(() => {
    const combined: MediaItem[] = [];
    // Interleave movies and series for variety
    const maxEach = 5;
    for (let i = 0; i < maxEach; i++) {
      if (popularMovies[i]) combined.push(popularMovies[i]);
      if (popularSeries[i]) combined.push(popularSeries[i]);
    }
    return combined.slice(0, 10);
  }, [popularMovies, popularSeries]);

  const continueWatchingItems = useMemo(() => {
    if (watchHistory.length === 0) return [];

    const seenSeries = new Set<string>();
    const items: typeof watchHistory = [];

    for (const item of watchHistory) {
      if (item.progress >= 95) continue;
      if (item.type === "movie") {
        items.push(item);
        continue;
      }
      if (!seenSeries.has(item.imdbId)) {
        seenSeries.add(item.imdbId);
        items.push(item);
      }
    }

    return items;
  }, [watchHistory]);

  // Fetch full details from Cinemeta for hero items missing logos
  useEffect(() => {
    if (featuredItems.length === 0) return;
    const missing = featuredItems.filter((item) => !item.logo);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.allSettled(
      missing.map(async (item) => {
        try {
          const details = await cinemetaService.getDetails(item.type, item.id);
          if (!cancelled && details?.logo) {
            item.logo = details.logo;
          }
        } catch { /* ignore */ }
      }),
    ).then(() => {
      if (!cancelled) setPopularMovies((prev) => [...prev]);
    });
    return () => { cancelled = true; };
  }, [featuredItems.length]);

  useEffect(() => {
    const hasFreshCache =
      _cachedPopularMovies.length > 0 &&
      Date.now() - _homeCacheTimestamp < HOME_CACHE_TTL_MS;

    if (hasFreshCache) return;

    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      if (!hasCachedData) setIsLoading(true);

      const [
        popularMoviesData,
        popularSeriesData,
        topRatedMoviesData,
        topRatedSeriesData,
      ] = await Promise.all([
        cinemetaService.getPopularMovies(),
        cinemetaService.getPopularSeries(),
        cinemetaService.getTopRatedMovies(),
        cinemetaService.getTopRatedSeries(),
      ]);

      // Persist to module-level cache
      _cachedPopularMovies = popularMoviesData;
      _cachedPopularSeries = popularSeriesData;
      _cachedTopRatedMovies = topRatedMoviesData;
      _cachedTopRatedSeries = topRatedSeriesData;
      _homeCacheTimestamp = Date.now();

      setPopularMovies(popularMoviesData);
      setPopularSeries(popularSeriesData);
      setTopRatedMovies(topRatedMoviesData);
      setTopRatedSeries(topRatedSeriesData);
    } catch (error) {
      console.error("Failed to load content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="home-page">
      <HeroBanner items={featuredItems} isLoading={isLoading} />

      <div className="content-rows">
        {/* Continue Watching - only show if there's history */}
        {/* For series, only show the most recent episode per series */}
        {continueWatchingItems.length > 0 && (
          <ContinueWatching
            items={continueWatchingItems}
          />
        )}

        <ForYouRow show={showForYou} />

        <MediaRow
          title="Popular Movies"
          items={popularMovies}
          isLoading={isLoading}
          viewMoreLink="/browse/popular-movies"
        />

        <MediaRow
          title="Popular TV Shows"
          items={popularSeries}
          isLoading={isLoading}
          viewMoreLink="/browse/popular-series"
        />

        <MediaRow
          title="Top Rated Movies"
          items={topRatedMovies}
          isLoading={isLoading}
          viewMoreLink="/browse/top-movies"
        />

        <MediaRow
          title="Top Rated TV Shows"
          items={topRatedSeries}
          isLoading={isLoading}
          viewMoreLink="/browse/top-series"
        />
      </div>
    </div>
  );
}
