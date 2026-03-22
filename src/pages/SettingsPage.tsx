import { useState, useEffect } from "react";
import { useSettingsStore, PlayerType, StreamSortMode } from "../stores";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useAuthStore } from "../stores/authStore";
import { tmdbService } from "../services/metadata/tmdb";
import { SUBTITLE_LANGUAGES } from "../utils/subtitleLanguages";
import { useUpdateChecker } from "../hooks/useUpdateChecker";
import { useNavigate } from "react-router-dom";
import { Check, XCircle } from "../components/Icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./SettingsPage.css";

// Font options for subtitles
const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "'Arial', sans-serif", label: "Arial" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Open Sans', sans-serif", label: "Open Sans" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const {
    autoPlay,
    autoPlayNext,
    skipIntro,
    skipOutro,
    playerType,
    subtitles,
    subtitleAppearance,
    blurUnwatchedEpisodes,
    showForYou,
    streamSorting,
    streamDetailMode,
    setAutoPlay,
    setAutoPlayNext,
    setSkipIntro,
    setSkipOutro,
    setPlayerType,
    setSubtitleAutoLoad,
    setSubtitleLanguage,
    setPreferHearingImpaired,
    setSubtitleAppearance,
    setBlurUnwatchedEpisodes,
    setShowForYou,
    setStreamSorting,
    setStreamDetailMode,
    preferredAudioLanguage,
    setPreferredAudioLanguage,
    tmdbCustomApiKey,
    tmdbUseCustomKey,
    setTmdbCustomApiKey,
    setTmdbUseCustomKey,
    clearTmdbCache,
    hardwareDecoding,
    setHardwareDecoding,
    resetSettings,
  } = useSettingsStore();

  // TMDB custom key state
  const [tmdbKeyInput, setTmdbKeyInput] = useState(tmdbCustomApiKey || "");
  const [tmdbValidating, setTmdbValidating] = useState(false);
  const [tmdbValidation, setTmdbValidation] = useState<boolean | null>(null);
  const [tmdbCacheCleared, setTmdbCacheCleared] = useState(false);

  const handleTmdbSaveKey = async () => {
    if (!tmdbKeyInput.trim()) return;
    setTmdbValidating(true);
    setTmdbValidation(null);
    try {
      const valid = await tmdbService.validateApiKey(tmdbKeyInput.trim());
      setTmdbValidation(valid);
      if (valid) {
        setTmdbCustomApiKey(tmdbKeyInput.trim());
        setTmdbUseCustomKey(true);
        tmdbService.clearCache();
      }
    } catch {
      setTmdbValidation(false);
    } finally {
      setTmdbValidating(false);
    }
  };

  const handleTmdbRemoveKey = () => {
    setTmdbCustomApiKey("");
    setTmdbUseCustomKey(false);
    setTmdbKeyInput("");
    setTmdbValidation(null);
    tmdbService.clearCache();
  };

  const handleTmdbClearCache = () => {
    clearTmdbCache();
    setTmdbCacheCleared(true);
    setTimeout(() => setTmdbCacheCleared(false), 2000);
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      {/* Subscription */}
      <section className="settings-section">
        <h2>Subscription</h2>
        <SubscriptionSection />
      </section>

      {/* Addons */}
      <section className="settings-section">
        <h2>Addons</h2>
        <p className="section-description">
          Install and manage addons from providers you choose.
        </p>
        <div className="setting-item">
          <div className="setting-info">
            <label>Installed Addons</label>
            <p>Add, remove, enable, disable, and reorder your addons</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/addons")}
          >
            Manage Addons
          </button>
        </div>
      </section>

      {/* Playback Settings */}
      <section className="settings-section">
        <h2>Playback</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play</label>
            <p>Automatically start playing when a source is found</p>
          </div>
          <button
            className={`toggle ${autoPlay ? "active" : ""}`}
            onClick={() => setAutoPlay(!autoPlay)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play Next Episode</label>
            <p>Automatically play the next episode when one ends</p>
          </div>
          <button
            className={`toggle ${autoPlayNext ? "active" : ""}`}
            onClick={() => setAutoPlayNext(!autoPlayNext)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Intro</label>
            <p>Automatically skip intros using IntroDB & AniSkip</p>
          </div>
          <button
            className={`toggle ${skipIntro ? "active" : ""}`}
            onClick={() => setSkipIntro(!skipIntro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Outro</label>
            <p>Automatically skip outros using IntroDB & AniSkip</p>
          </div>
          <button
            className={`toggle ${skipOutro ? "active" : ""}`}
            onClick={() => setSkipOutro(!skipOutro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Video Player</label>
            <p>
              Choose your preferred video player. MPV offers better codec
              support.
            </p>
          </div>
          <select
            className="select"
            value={playerType}
            onChange={(e) => setPlayerType(e.target.value as PlayerType)}
          >
            <option value="default">Built-in Player</option>
            <option value="embedded-mpv">
              MPV Player (Better codec support)
            </option>
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Hardware Accelerated Decoding</label>
            <p>Use GPU hardware decoding (D3D11VA on Windows). Disable if you experience black screens or playback glitches.</p>
          </div>
          <button
            className={`toggle ${hardwareDecoding ?? true ? "active" : ""}`}
            onClick={() => setHardwareDecoding(!(hardwareDecoding ?? true))}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Stream Sorting</label>
            <p>
              "Best quality first" sorts all streams by quality across addons.
              "Group by addon" keeps streams grouped by their addon order.
            </p>
          </div>
          <select
            className="select"
            value={streamSorting}
            onChange={(e) => setStreamSorting(e.target.value as StreamSortMode)}
          >
            <option value="quality">Best Quality First</option>
            <option value="addon">Group by Addon</option>
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Detailed Stream Info</label>
            <p>Show full source details including codecs, audio, and languages</p>
          </div>
          <button
            className={`toggle ${streamDetailMode ? "active" : ""}`}
            onClick={() => setStreamDetailMode(!streamDetailMode)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Preferred Audio Language</label>
            <p>Automatically select this audio language when available</p>
          </div>
          <select
            className="select"
            value={preferredAudioLanguage}
            onChange={(e) => setPreferredAudioLanguage(e.target.value)}
          >
            {SUBTITLE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* TMDB Metadata */}
      <section className="settings-section">
        <h2>TMDB Metadata</h2>
        <p className="section-description">
          TMDB provides rich metadata like cast photos, trailers, production
          companies, and recommendations. A built-in API key is included —
          provide your own for better rate limits.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Use Custom API Key</label>
            <p>
              {tmdbUseCustomKey && tmdbCustomApiKey
                ? "Using your custom TMDB API key"
                : "Currently using built-in API key"}
            </p>
          </div>
          <button
            className={`toggle ${tmdbUseCustomKey ? "active" : ""}`}
            onClick={() => {
              if (tmdbUseCustomKey) {
                handleTmdbRemoveKey();
              } else if (tmdbCustomApiKey) {
                setTmdbUseCustomKey(true);
                tmdbService.clearCache();
              }
            }}
            disabled={!tmdbUseCustomKey && !tmdbCustomApiKey}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Custom API Key</label>
            <p>
              Get a free key at{" "}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--primary)" }}
              >
                themoviedb.org
              </a>
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              className="input"
              placeholder="Enter TMDB API key (v3)"
              value={tmdbKeyInput}
              onChange={(e) => {
                setTmdbKeyInput(e.target.value);
                setTmdbValidation(null);
              }}
              style={{ width: "260px" }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTmdbSaveKey}
              disabled={tmdbValidating || !tmdbKeyInput.trim()}
            >
              {tmdbValidating ? "Validating..." : "Save"}
            </button>
            {tmdbUseCustomKey && tmdbCustomApiKey && (
              <button
                className="btn btn-ghost btn-sm danger"
                onClick={handleTmdbRemoveKey}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {tmdbValidation === true && (
          <div className="update-status update-current">
            <Check size={14} />
            <span>API key is valid and saved</span>
          </div>
        )}
        {tmdbValidation === false && (
          <div className="update-status update-error">
            <XCircle size={14} />
            <span>Invalid API key — please check and try again</span>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-info">
            <label>Clear Metadata Cache</label>
            <p>Force reload all TMDB data on next visit</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTmdbClearCache}
          >
            {tmdbCacheCleared ? "Cleared!" : "Clear Cache"}
          </button>
        </div>
      </section>

      {/* Subtitles */}
      <section className="settings-section">
        <h2>Subtitles</h2>
        <p className="section-description">
          Configure automatic subtitle loading and language preferences.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto-load Subtitles</label>
            <p>Automatically fetch and load subtitles when playing content</p>
          </div>
          <button
            className={`toggle ${subtitles.autoLoad ? "active" : ""}`}
            onClick={() => setSubtitleAutoLoad(!subtitles.autoLoad)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Default Subtitle Language</label>
            <p>Primary language for automatic subtitle loading</p>
          </div>
          <select
            className="input select-input"
            value={subtitles.defaultLanguage}
            onChange={(e) => setSubtitleLanguage(e.target.value)}
          >
            {SUBTITLE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Prefer Hearing Impaired</label>
            <p>Prefer subtitles with sound effect descriptions [door slams]</p>
          </div>
          <button
            className={`toggle ${subtitles.preferHearingImpaired ? "active" : ""}`}
            onClick={() =>
              setPreferHearingImpaired(!subtitles.preferHearingImpaired)
            }
          >
            <span className="toggle-handle" />
          </button>
        </div>

        {/* Subtitle Appearance */}
        <div className="subtitle-appearance-section">
          <h3>Subtitle Appearance</h3>

          {/* Preview - matches SubtitleOverlay exactly */}
          <div className="subtitle-preview">
            <div className="subtitle-preview-video">
              <div
                className="subtitle-preview-text"
                style={{
                  fontSize: `${subtitleAppearance.fontSize ?? 22}px`,
                  fontFamily: subtitleAppearance.fontFamily ?? "sans-serif",
                  color: subtitleAppearance.textColor ?? "#FFFFFF",
                  backgroundColor: (() => {
                    const hex = (
                      subtitleAppearance.backgroundColor ?? "#000000"
                    ).replace("#", "");
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${subtitleAppearance.backgroundOpacity ?? 0.75})`;
                  })(),
                  textShadow:
                    (subtitleAppearance.textShadow ?? false)
                      ? "2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6)"
                      : "none",
                  lineHeight: subtitleAppearance.lineHeight ?? 1.4,
                  bottom: `${subtitleAppearance.bottomPosition ?? 10}%`,
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                  fontWeight: 500,
                  maxWidth: "80%",
                }}
              >
                This is how your subtitles will look
                <br />
                Second line of subtitle text
              </div>
            </div>
          </div>

          <div className="appearance-controls">
            <div className="appearance-row">
              <label>Font Size</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="16"
                  max="36"
                  value={subtitleAppearance.fontSize ?? 28}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      fontSize: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.fontSize ?? 28}px</span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Font Family</label>
              <select
                className="input select-input"
                value={subtitleAppearance.fontFamily}
                onChange={(e) =>
                  setSubtitleAppearance({ fontFamily: e.target.value })
                }
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="appearance-row">
              <label>Text Color</label>
              <input
                type="color"
                value={subtitleAppearance.textColor}
                onChange={(e) =>
                  setSubtitleAppearance({ textColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Color</label>
              <input
                type="color"
                value={subtitleAppearance.backgroundColor}
                onChange={(e) =>
                  setSubtitleAppearance({ backgroundColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Opacity</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((subtitleAppearance.backgroundOpacity ?? 0.6) * 100)}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      backgroundOpacity: parseInt(e.target.value) / 100,
                    })
                  }
                />
                <span>
                  {Math.round((subtitleAppearance.backgroundOpacity ?? 0.6) * 100)}%
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Text Shadow</label>
              <button
                className={`toggle ${subtitleAppearance.textShadow ? "active" : ""}`}
                onClick={() =>
                  setSubtitleAppearance({
                    textShadow: !subtitleAppearance.textShadow,
                  })
                }
              >
                <span className="toggle-handle" />
              </button>
            </div>

            <div className="appearance-row">
              <label>Line Spacing</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="12"
                  max="20"
                  step="1"
                  value={Math.round(
                    (subtitleAppearance.lineHeight ?? 1.4) * 10,
                  )}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      lineHeight: parseInt(e.target.value) / 10,
                    })
                  }
                />
                <span>
                  {(subtitleAppearance.lineHeight ?? 1.4).toFixed(1)}x
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Bottom Position</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="5"
                  max="25"
                  value={subtitleAppearance.bottomPosition ?? 10}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      bottomPosition: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.bottomPosition ?? 10}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Display Settings */}
      <section className="settings-section">
        <h2>Display</h2>
        <p className="section-description">
          Customize how content is displayed.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Blur Unwatched Episode Thumbnails</label>
            <p>
              Blur episode images to avoid spoilers until you start watching
            </p>
          </div>
          <button
            className={`toggle ${blurUnwatchedEpisodes ? "active" : ""}`}
            onClick={() => setBlurUnwatchedEpisodes(!blurUnwatchedEpisodes)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Show "For You" Recommendations</label>
            <p>
              Display personalized recommendations on the home page based on
              your library
            </p>
          </div>
          <button
            className={`toggle ${showForYou ? "active" : ""}`}
            onClick={() => setShowForYou(!showForYou)}
          >
            <span className="toggle-handle" />
          </button>
        </div>
      </section>

      {/* About & Updates */}
      <section className="settings-section">
        <h2>About</h2>
        <AboutSection />
      </section>

      {/* Reset */}
      <section className="settings-section">
        <h2>Reset</h2>
        <button className="btn btn-ghost danger" onClick={resetSettings}>
          Reset All Settings
        </button>
      </section>

      {/* Account */}
      <section className="settings-section">
        <h2>Account</h2>
        <DeleteAccountSection />
      </section>
    </div>
  );
}

// ============================================================================
// SUBSCRIPTION SECTION
// ============================================================================

function SubscriptionSection() {
  const { subscription, isLoading, checkoutLoading, error, fetchStatus, startCheckout, openPortal, clearError } =
    useSubscriptionStore();

  useEffect(() => {
    fetchStatus();
  }, []);

  // Re-fetch subscription status when user comes back to the app after checkout
  useEffect(() => {
    const onFocus = () => { fetchStatus(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isTrialing = subscription?.status === "trialing";
  const isCanceled = subscription?.status === "canceled";
  const isPastDue = subscription?.status === "past_due";

  const handleUpgrade = async () => {
    clearError();
    const url = await startCheckout();
    if (url) {
      await openUrl(url);
    }
  };

  const handlePortal = async () => {
    clearError();
    const url = await openPortal();
    if (url) {
      await openUrl(url);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading && !subscription) {
    return <p className="section-description">Loading subscription status…</p>;
  }

  return (
    <>
      {error && (
        <div className="subscription-error">
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={clearError}>✕</button>
        </div>
      )}

      <div className={`subscription-card ${isActive ? "subscription-card--active" : ""} ${isTrialing ? "subscription-card--trial" : ""}`}>
        <div className="subscription-header">
          <div className="subscription-plan-info">
            <div className="tier-display">
              <span className="subscription-plan-name">
                {isActive ? "FlowVid Plus" : "FlowVid Free"}
              </span>
              {isTrialing && <span className="tier-badge tier-trial">TRIAL</span>}
              {subscription?.status === "active" && !isTrialing && <span className="tier-badge tier-plus">PRO</span>}
              {isCanceled && <span className="tier-badge tier-canceled">CANCELED</span>}
              {isPastDue && <span className="tier-badge tier-pastdue">PAST DUE</span>}
              {!isActive && !isCanceled && !isPastDue && <span className="tier-badge tier-free">FREE</span>}
            </div>
            <p className="subscription-plan-desc">
              {isTrialing
                ? `Your free trial is active until ${formatDate(subscription?.currentPeriodEnd ?? null)}.`
                : isActive
                ? subscription?.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(subscription?.currentPeriodEnd ?? null)}`
                  : `Renews on ${formatDate(subscription?.currentPeriodEnd ?? null)}`
                : isCanceled
                  ? "Your trial has ended. Subscribe to FlowVid+ to continue enjoying addons, library sync across devices, and more."
                  : subscription?.trialEligible === false
                    ? "You're on the free plan. Upgrade to FlowVid+ to install addons, save to your library, sync across devices, and more."
                    : "You're on the free plan. Upgrade to FlowVid+ to install addons, save to your library, sync across devices, and more. Try it free for 1 month!"}
            </p>
          </div>
          <div className="subscription-header-actions">
            {isActive ? (
              <button className="btn btn-secondary" onClick={handlePortal}>
                Manage
              </button>
            ) : (
              <button
                className="btn btn-upgrade"
                onClick={handleUpgrade}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? "Opening…" : (isCanceled || subscription?.trialEligible === false) ? "Upgrade to FlowVid+" : "Start Free Trial"}
              </button>
            )}
          </div>
        </div>

        {isActive && (
          <div className="subscription-details">
            <div className="subscription-detail-item">
              <span className="subscription-label">Status</span>
              <span className={`subscription-status-indicator ${isTrialing ? "indicator-trial" : "indicator-active"}`}>
                <span className="status-dot" />
                {isTrialing ? "Trial" : "Active"}
              </span>
            </div>
            <div className="subscription-detail-item">
              <span className="subscription-label">Plan</span>
              <span className="subscription-value">{subscription?.plan === "standard" ? "Standard" : subscription?.plan ?? "Standard"}</span>
            </div>
            <div className="subscription-detail-item">
              <span className="subscription-label">{isTrialing ? "Trial ends" : subscription?.cancelAtPeriodEnd ? "Cancels on" : "Next billing"}</span>
              <span className="subscription-value">{formatDate(subscription?.currentPeriodEnd ?? null)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="subscription-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={fetchStatus}
          disabled={isLoading}
        >
          {isLoading ? "Checking…" : "Refresh Status"}
        </button>
      </div>
    </>
  );
}

// ============================================================================
// ABOUT SECTION
// ============================================================================

function AboutSection() {
  const { checkForUpdates: checkApi, isChecking: isCheckingApi, result, error: apiError, currentVersion } =
    useUpdateChecker();
  const [tauriChecking, setTauriChecking] = useState(false);
  const [tauriUpdate, setTauriUpdate] = useState<import("@tauri-apps/plugin-updater").Update | null>(null);
  const [tauriError, setTauriError] = useState<string | null>(null);

  const isChecking = isCheckingApi || tauriChecking;

  const handleCheck = async () => {
    setTauriError(null);
    setTauriUpdate(null);
    // Check via Tauri updater (handles download too)
    try {
      setTauriChecking(true);
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setTauriUpdate(update);
      }
    } catch {
      // Fall through to API check
    } finally {
      setTauriChecking(false);
    }
    // Also check the API for version info / notes
    await checkApi();
  };

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-info">
          <label>Version</label>
          <p>FlowVid v{currentVersion}</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={handleCheck}
          disabled={isChecking}
        >
          {isChecking ? "Checking..." : "Check for Updates"}
        </button>
      </div>

      {tauriUpdate && (
        <div className="update-status update-available">
          <span>Update available: v{tauriUpdate.version}</span>
          {tauriUpdate.body && <p className="update-notes">{tauriUpdate.body}</p>}
        </div>
      )}

      {result && !result.hasUpdate && !tauriUpdate && (
        <div className="update-status update-current">
          <Check size={14} />
          <span>You're up to date!</span>
        </div>
      )}

      {result && result.hasUpdate && !tauriUpdate && (
        <div
          className={`update-status ${result.forceUpdate ? "update-force" : "update-available"}`}
        >
          <span>
            {result.forceUpdate
              ? `⚠️ Critical update required: v${result.latestVersion}`
              : `Update available: v${result.latestVersion}`}
          </span>
          {result.notes && <p className="update-notes">{result.notes}</p>}
          {result.storeUrl && (
            <a
              href={result.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Download Update
            </a>
          )}
        </div>
      )}

      {(apiError || tauriError) && (
        <div className="update-status update-error">
          <XCircle size={14} />
          <span>{tauriError || apiError}</span>
        </div>
      )}
    </>
  );
}

// ============================================================================
// DELETE ACCOUNT SECTION
// ============================================================================

function DeleteAccountSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (!password) {
      setDeleteError("Enter your password to confirm");
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const token = useAuthStore.getState().token;
      const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";
      const res = await fetch(`${API_URL}/auth/account/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      // Clear all local state and redirect to login
      useAuthStore.getState().logout();
      localStorage.clear();
      navigate("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  if (!showConfirm) {
    return (
      <div className="settings-row">
        <div className="settings-row-info">
          <label>Delete Account</label>
          <p>Permanently delete your account and all associated data</p>
        </div>
        <button
          className="btn btn-ghost danger"
          onClick={() => setShowConfirm(true)}
        >
          Delete Account
        </button>
      </div>
    );
  }

  return (
    <div className="delete-account-confirm">
      <div className="delete-account-warning">
        <strong>⚠️ This action is permanent and cannot be undone.</strong>
        <p>
          Your library, watch history, profiles, addons, and all account data
          will be permanently deleted. If you have an active subscription it will
          remain active until the end of your billing period — manage it through
          the subscription portal before deleting.
        </p>
      </div>
      <div className="delete-account-form">
        <input
          type="password"
          className="input"
          placeholder="Enter your password to confirm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={deleting}
        />
        {deleteError && (
          <div className="form-error">{deleteError}</div>
        )}
        <div className="delete-account-actions">
          <button
            className="btn btn-ghost"
            onClick={() => { setShowConfirm(false); setPassword(""); setDeleteError(null); }}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleting || !password}
          >
            {deleting ? "Deleting..." : "Permanently Delete Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
