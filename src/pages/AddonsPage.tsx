import { useState, useRef } from "react";
import { useAddonStore } from "../stores/addonStore";
import { useFeatureGate } from "../hooks/useFeatureGate";
import { UpgradePrompt } from "../components";
import "./AddonsPage.css";

export function AddonsPage() {
  const { addons, isLoading, error, installAddon, removeAddon, toggleAddon, reorderAddon, refreshManifest, clearError } =
    useAddonStore();
  const { canInstallAddons } = useFeatureGate();
  const [manifestUrl, setManifestUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [addonPendingRemoval, setAddonPendingRemoval] = useState<{ id: string; name: string } | null>(null);

  // Drag-to-reorder state
  const dragIdxRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestUrl.trim()) return;

    // Normalise: if user pasted a non-manifest.json URL, try to append it
    let url = manifestUrl.trim();
    if (!url.endsWith("/manifest.json")) {
      url = url.replace(/\/$/, "") + "/manifest.json";
    }

    setInstalling(true);
    setInstallError(null);
    clearError();

    try {
      await installAddon(url);
      setManifestUrl("");
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Failed to install addon.");
    } finally {
      setInstalling(false);
    }
  };

  const sortedAddons = [...addons].sort((a, b) => a.order - b.order);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdxRef.current !== null && dragIdxRef.current !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdxRef.current !== null && dragIdxRef.current !== idx) {
      const addon = sortedAddons[dragIdxRef.current];
      if (addon) {
        reorderAddon(addon.id, idx);
      }
    }
    dragIdxRef.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragIdxRef.current = null;
    setDragOverIdx(null);
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    await Promise.allSettled(addons.map((a) => refreshManifest(a.id)));
    setUpdatingAll(false);
  };

  const handleUpdateOne = async (addonId: string) => {
    setUpdatingId(addonId);
    await refreshManifest(addonId);
    setUpdatingId(null);
  };

  const handleConfirmRemoveAddon = () => {
    if (!addonPendingRemoval) return;
    removeAddon(addonPendingRemoval.id);
    setAddonPendingRemoval(null);
  };

  return (
    <div className="addons-page">
      <div className="addons-hero">
        <h1 className="addons-title">Addons</h1>
        <p className="addons-subtitle">
          Install and manage third-party addons.
        </p>
      </div>

      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}

      {/* Install form */}
      <section className="addons-install-section">
        <form className="addons-install-form" onSubmit={canInstallAddons ? handleInstall : (e) => { e.preventDefault(); setShowUpgrade(true); }}>
          <input
            type="url"
            className="addons-url-input"
            placeholder="Paste addon manifest URL…"
            value={manifestUrl}
            onChange={(e) => setManifestUrl(e.target.value)}
            disabled={installing}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="addons-install-btn"
            disabled={installing || !manifestUrl.trim()}
          >
            {installing ? "Installing…" : "Install"}
          </button>
        </form>
        {(installError || error) && (
          <p className="addons-error">{installError || error}</p>
        )}
      </section>

      {/* Installed addons list */}
      <section className="addons-list-section">
        {sortedAddons.length > 0 && (
          <div className="addons-list-header">
            <div className="addons-list-header-left">
              <span className="addons-count">{sortedAddons.length} installed</span>
              <span className="addons-reorder-hint">Drag to reorder priority</span>
            </div>
            <button
              className="addons-update-all-btn"
              onClick={handleUpdateAll}
              disabled={updatingAll}
              title="Re-fetch all addon manifests"
            >
              {updatingAll ? "Updating…" : "Update All"}
            </button>
          </div>
        )}

        {sortedAddons.length === 0 ? (
          <div className="addons-empty">
            <div className="addons-empty-icon">📦</div>
            <p className="addons-empty-text">No addons installed</p>
            <p className="addons-empty-hint">
              Paste an addon manifest URL above to get started
            </p>
          </div>
        ) : (
          <ul className="addons-list">
            {sortedAddons.map((addon, idx) => (
              <li
                key={addon.id}
                className={`addon-card${addon.enabled ? "" : " addon-card--disabled"}${dragOverIdx === idx ? " addon-card--drag-over" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                <div className="addon-drag-handle" title="Drag to reorder">
                  <span className="drag-dots">⠿</span>
                </div>
                <div className="addon-card-logo">
                  {addon.manifest.logo ? (
                    <img src={addon.manifest.logo} alt="" className="addon-logo-img" />
                  ) : (
                    <div className="addon-logo-placeholder">
                      {addon.manifest.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="addon-card-info">
                  <div className="addon-card-header">
                    <span className="addon-name">{addon.manifest.name}</span>
                    <span className="addon-version">v{addon.manifest.version}</span>
                    {!addon.enabled && <span className="addon-badge-disabled">Disabled</span>}
                    <span className="addon-priority">#{idx + 1}</span>
                  </div>
                  {addon.manifest.description && (
                    <p className="addon-description">{addon.manifest.description}</p>
                  )}
                  <div className="addon-resources">
                    {addon.manifest.resources.map((r) => (
                      <span key={typeof r === "string" ? r : r.name} className="resource-chip">
                        {typeof r === "string" ? r : r.name}
                      </span>
                    ))}
                    {addon.manifest.types.map((t) => (
                      <span key={t} className="type-chip">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="addon-card-actions">
                  <button
                    className="addon-action-btn"
                    onClick={() => reorderAddon(addon.id, idx - 1)}
                    disabled={idx === 0}
                    title="Move up (higher priority)"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="addon-action-btn"
                    onClick={() => reorderAddon(addon.id, idx + 1)}
                    disabled={idx === sortedAddons.length - 1}
                    title="Move down (lower priority)"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className={`addon-toggle-btn${addon.enabled ? " addon-toggle-btn--on" : ""}`}
                    onClick={() => toggleAddon(addon.id)}
                    title={addon.enabled ? "Disable" : "Enable"}
                  >
                    {addon.enabled ? "On" : "Off"}
                  </button>
                  <button
                    className="addon-update-btn"
                    onClick={() => handleUpdateOne(addon.id)}
                    disabled={updatingId === addon.id || updatingAll}
                    title="Update manifest"
                    aria-label="Update"
                  >
                    {updatingId === addon.id ? "↻" : "↻"}
                  </button>
                  <button
                    className="addon-remove-btn"
                    onClick={() => {
                      setAddonPendingRemoval({ id: addon.id, name: addon.manifest.name });
                    }}
                    title="Remove addon"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sortedAddons.length > 0 && (
        <p className="addons-disclaimer">
          FlowVid does not provide or host addon content. You control what you install and use.
        </p>
      )}

      {isLoading && <div className="addons-loading">Syncing…</div>}

      {addonPendingRemoval && (
        <div className="addons-confirm-overlay" onClick={() => setAddonPendingRemoval(null)}>
          <div className="addons-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove Addon</h3>
            <p>
              Remove <strong>{addonPendingRemoval.name}</strong> from this account?
            </p>
            <p className="addons-confirm-note">
              This removes the addon from your installed list and it will stop being used for streams.
            </p>
            <div className="addons-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setAddonPendingRemoval(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmRemoveAddon}>
                Remove Addon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
