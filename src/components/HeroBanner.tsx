import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import { useValidatedImage, getImageCacheStatus, validateImageUrl, rememberValidatedImageResult, normalizeImageUrl } from "../utils/useValidatedImage";
import { StarFilled } from "./Icons";
import "./HeroBanner.css";

const ROTATE_INTERVAL = 15000; // 15 seconds
const CROSSFADE_DURATION = 800; // ms — matches CSS transition

/** Module-level set to remember image URLs we have already preloaded (requested). */
const preloadedUrls = new Set<string>();
/** Module-level set for images that have fully loaded into the browser cache. */
const loadedUrls = new Set<string>();
/** Module-level cache of the last displayed hero backdrop so remounting
 *  after page navigation never starts with a blank frame. */
let _lastHeroBaseUrl: string | null = null;

/**
 * Strong references kept at module level so the browser never GC-evicts
 * the decoded pixel data between page navigations.  When HeroBanner remounts
 * and creates a new <img> with the same src, the browser finds the already-
 * decoded bitmap and paints it in the same frame — no blank-frame flash.
 */
const _pinnedImages: HTMLImageElement[] = [];

function preloadImage(url: string | undefined | null) {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl || preloadedUrls.has(normalizedUrl)) return;
  preloadedUrls.add(normalizedUrl);
  const img = new Image();
  img.onload = () => loadedUrls.add(normalizedUrl);
  img.src = normalizedUrl;
  // Keep a strong JS reference so the decoded image stays in browser memory
  _pinnedImages.push(img);
  if (_pinnedImages.length > 20) _pinnedImages.splice(0, 5);
}

/**
 * Ensure a backdrop image is loaded into the browser cache.
 * Resolves immediately if the image is already cached.
 */
function ensureImageLoaded(url: string): Promise<void> {
  return new Promise((resolve) => {
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) {
      resolve();
      return;
    }
    if (loadedUrls.has(normalizedUrl)) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedUrls.add(normalizedUrl);
      resolve();
    };
    img.onerror = () => resolve(); // show anyway on error
    img.src = normalizedUrl;
  });
}

interface HeroBannerProps {
  items: MediaItem[];
  isLoading?: boolean;
}

export function HeroBanner({ items, isLoading = false }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Logo visibility — start visible if the image was already preloaded
  const [logoLoaded, setLogoLoaded] = useState(() => {
    const logoUrl = items[0]?.logo;
    return !!(logoUrl && loadedUrls.has(logoUrl));
  });
  const logoRef = useRef<HTMLImageElement>(null);

  // Simple two-layer crossfade:
  //   baseUrl  — always opacity 1 (the "old" image, sits underneath)
  //   topUrl   — fades in from opacity 0 → 1 on top, then gets copied to baseUrl
  // After the crossfade finishes, baseUrl becomes the new image and topUrl is
  // hidden instantly (no reverse animation) so the next transition can begin.
  //
  // Prefer items[0]?.backdrop on remount (matches the text content for
  // activeIndex 0), fall back to _lastHeroBaseUrl so we never flash black.
  // Only render immediately if cache says it's good; otherwise defer to effect.
  const [baseUrl, _setBaseUrl] = useState<string | null>(() => {
    const candidate = normalizeImageUrl(items[0]?.backdrop ?? _lastHeroBaseUrl ?? null);
    if (!candidate) return null;
    const status = getImageCacheStatus(candidate);
    if (status === false) return null;  // known bad
    if (status === true) return candidate; // known good
    return null; // unknown — validate via effect first
  });

  // Ref so the mount-validation effect only runs once for the initial candidate.
  const initialCandidateRef = useRef(
    normalizeImageUrl(items[0]?.backdrop ?? _lastHeroBaseUrl ?? null),
  );

  // Wrap setter so every update persists to the module-level cache.
  const setBaseUrl = useCallback((url: string | null) => {
    const normalizedUrl = normalizeImageUrl(url);
    _lastHeroBaseUrl = normalizedUrl;
    _setBaseUrl(normalizedUrl);
  }, []);
  const [topUrl, setTopUrl] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const crossfadeRef = useRef(false);

  const [logoError, setLogoError] = useState(false);

  const item = items.length > 0 ? items[activeIndex % items.length] : null;
  const validLogo = useValidatedImage(item?.logo);

  // On mount: validate the initial candidate that was deferred from useState.
  useEffect(() => {
    const url = initialCandidateRef.current;
    if (!url || baseUrl !== null) return;
    validateImageUrl(url).then((ok) => {
      if (ok) setBaseUrl(url);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When items arrive (possibly after mount) make sure we have a baseUrl.
  // Validate via tauriFetch HEAD so the browser never fires a 404 GET.
  useEffect(() => {
    if (!item?.backdrop) return;
    if (baseUrl === null) {
      const url = normalizeImageUrl(item.backdrop!);
      if (!url) return;
      validateImageUrl(url).then((ok) => {
        if (ok) setBaseUrl(url);
      });
    }
  }, [item?.backdrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeIndex changes (after initial), crossfade to the new backdrop
  const prevIndexRef = useRef(activeIndex);
  useEffect(() => {
    if (prevIndexRef.current === activeIndex) return;
    prevIndexRef.current = activeIndex;

    const newItem = items[activeIndex % items.length];
    const newUrl = normalizeImageUrl(newItem?.backdrop);
    if (!newUrl) return;
    if (crossfadeRef.current) return; // don't overlap
    crossfadeRef.current = true;

    // Validate the URL through Rust so the browser never fires a 404 GET.
    validateImageUrl(newUrl).then((ok) => {
      if (!ok) { crossfadeRef.current = false; return; }
      ensureImageLoaded(newUrl).then(() => {
        // Put new image on top layer, then fade it in
        setTopUrl(newUrl);
        // Double rAF to ensure the browser has painted opacity 0 before we animate to 1
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setShowTop(true);
          });
        });

        // After the CSS transition completes, promote the top image to base and reset
        setTimeout(() => {
          setBaseUrl(newUrl);
          // Instantly hide top layer — no animation because we remove the active class
          // which also removes the CSS transition property
          setShowTop(false);
          setTopUrl(null);
          crossfadeRef.current = false;
        }, CROSSFADE_DURATION + 50); // small buffer beyond CSS duration
      });
    });
  }, [activeIndex, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload current + next backdrop & logo images
  useEffect(() => {
    if (items.length === 0) return;
    for (let offset = 0; offset < Math.min(3, items.length); offset++) {
      const idx = (activeIndex + offset) % items.length;
      const m = items[idx];
      preloadImage(m?.backdrop);
      preloadImage(m?.logo);
    }
  }, [items, activeIndex]);

  // When the logo URL changes, check if it's already cached before
  // resetting to invisible.  This prevents the logo from disappearing
  // on remount when the image is already in the browser cache.
  useEffect(() => {
    setLogoError(false);
    if (validLogo && loadedUrls.has(validLogo)) {
      // Already preloaded — show immediately, no fade needed
      setLogoLoaded(true);
      return;
    }
    setLogoLoaded(false);
    // Safety net: after the <img> has rendered, check if the browser
    // resolved it synchronously from its HTTP cache (onLoad may not
    // fire for already-cached images in some webview engines).
    const raf = requestAnimationFrame(() => {
      if (logoRef.current?.complete && logoRef.current.naturalWidth > 0) {
        setLogoLoaded(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [validLogo]);

  const goTo = useCallback(
    (index: number) => {
      if (items.length === 0 || isTransitioning) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex(index % items.length);
        setIsTransitioning(false);
      }, 400);
    },
    [items.length, isTransitioning],
  );

  // Auto-rotate
  useEffect(() => {
    if (items.length <= 1) return;

    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
        setIsTransitioning(false);
      }, 400);
    }, ROTATE_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  // Reset timer on manual navigation
  const handleDotClick = (index: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(index);
    // Restart auto-rotate
    if (items.length > 1) {
      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setActiveIndex((prev) => (prev + 1) % items.length);
          setIsTransitioning(false);
        }, 400);
      }, ROTATE_INTERVAL);
    }
  };

  if (isLoading) {
    return (
      <div className="hero-banner hero-loading">
        <div className="hero-skeleton"></div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  // Determine which layer is "active" (bottom, fully visible) and which is "incoming" (top, fading in)

  return (
    <div className="hero-banner">
      {/* Backdrop images with crossfade animation */}
      {baseUrl && (
        <img
          className="hero-backdrop"
          src={baseUrl}
          alt=""
          // eslint-disable-next-line
          {...{ fetchpriority: "high" } as any}
          style={{ opacity: 1, zIndex: 0 }}
          onError={() => {
            rememberValidatedImageResult(baseUrl, false);
            setBaseUrl(null);
          }}
        />
      )}

      {/* Top layer — fades in during crossfade, then instantly hidden */}
      {topUrl && (
        <img
          className={`hero-backdrop hero-backdrop-top${showTop ? " hero-backdrop-active" : ""}`}
          src={topUrl}
          alt=""
          style={{ zIndex: 1 }}
          onError={() => {
            rememberValidatedImageResult(topUrl, false);
            setTopUrl(null);
            setShowTop(false);
            crossfadeRef.current = false;
          }}
        />
      )}

      {/* Gradient overlay */}
      <div className="hero-gradient" />

      <div
        className={`hero-content ${isTransitioning ? "hero-content-fade" : ""}`}
      >
        <div className="hero-heading">
          {validLogo && !logoError ? (
            <img
              ref={logoRef}
              className={`hero-logo ${logoLoaded ? "hero-logo-loaded" : ""}`}
              src={validLogo}
              alt={item.title}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoError(true)}
            />
          ) : (
            <h1 className="hero-title">{item.title}</h1>
          )}
        </div>

        <div className="hero-meta">
          {item.rating > 0 && (
            <span className="hero-meta-chip hero-rating-chip">
              <span className="star">
                <StarFilled size={14} />
              </span>
              {item.rating.toFixed(1)}
            </span>
          )}
          {typeof item.year === "number" && item.year > 0 && (
            <span className="hero-meta-chip">{item.year}</span>
          )}
          <span className="hero-meta-chip hero-type-chip">
            {item.type === "movie" ? "Movie" : "Series"}
          </span>
          {item.genres && item.genres.length > 0 && (
            <span className="hero-meta-chip hero-genre-chip">
              {item.genres.slice(0, 2).join(" • ")}
            </span>
          )}
        </div>

        <p className="hero-overview">
          {item.overview?.slice(0, 300)}
          {item.overview && item.overview.length > 300 ? "..." : ""}
        </p>

        <div className="hero-actions">
          <Link
            to={`/details/${item.type}/${item.id}`}
            className="hero-pill hero-pill-secondary"
          >
            More Info
          </Link>
        </div>
      </div>

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="hero-dots">
          {items.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === activeIndex % items.length ? "hero-dot-active" : ""}`}
              onClick={() => handleDotClick(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
