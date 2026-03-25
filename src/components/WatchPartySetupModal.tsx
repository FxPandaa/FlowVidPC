import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "./Icons";
import type { WatchPartyMedia } from "../stores/watchPartyStore";
import { watchPartyService } from "../services/watchPartyService";
import { useValidatedImage } from "../utils/useValidatedImage";
import "./WatchPartySetupModal.css";

interface WatchPartySetupModalProps {
  media: WatchPartyMedia;
  onClose: () => void;
  onRoomReady: (roomCode: string, isHost: boolean, media: WatchPartyMedia) => void;
}

export function WatchPartySetupModal({ media, onClose, onRoomReady }: WatchPartySetupModalProps) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const posterUrl = useValidatedImage(media.poster || null);

  const handleCreateRoom = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const roomCode = await watchPartyService.createRoom(media);
      setCreatedCode(roomCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) {
      setError("Enter a valid 6-character room code");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await watchPartyService.joinRoom(code);
      onRoomReady(code, false, result.media);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartWatching = () => {
    if (createdCode) {
      onRoomReady(createdCode, true, media);
    }
  };

  return createPortal(
    <div className="wp-setup-backdrop" onClick={onClose}>
      <div className="wp-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wp-setup-header">
          <h2>Watch Together</h2>
          <button className="wp-setup-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="wp-setup-tabs">
          <button
            className={`wp-setup-tab ${tab === "create" ? "active" : ""}`}
            onClick={() => { setTab("create"); setError(null); }}
          >
            Create Room
          </button>
          <button
            className={`wp-setup-tab ${tab === "join" ? "active" : ""}`}
            onClick={() => { setTab("join"); setError(null); }}
          >
            Join Room
          </button>
        </div>

        <div className="wp-setup-content">
          {tab === "create" && (
            <div className="wp-setup-create">
              <div className="wp-setup-media-info">
                {posterUrl && <img src={posterUrl} alt="" className="wp-setup-poster" />}
                <div>
                  <div className="wp-setup-media-title">{media.title}</div>
                  {media.season && media.episode && (
                    <div className="wp-setup-media-episode">
                      S{media.season}E{media.episode}
                    </div>
                  )}
                </div>
              </div>

              {!createdCode ? (
                <button
                  className="wp-setup-btn primary"
                  onClick={handleCreateRoom}
                  disabled={isLoading}
                >
                  {isLoading ? "Creating..." : "Create Room"}
                </button>
              ) : (
                <div className="wp-setup-code-area">
                  <div className="wp-setup-code-label">Share this code with friends:</div>
                  <div className="wp-setup-code-display" onClick={handleCopyCode}>
                    <span className="wp-setup-code">{createdCode}</span>
                    <span className="wp-setup-copy-hint">{copied ? "Copied!" : "Click to copy"}</span>
                  </div>
                  <button className="wp-setup-btn primary" onClick={handleStartWatching}>
                    Start Watching
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "join" && (
            <div className="wp-setup-join">
              <div className="wp-setup-input-group">
                <label>Room Code</label>
                <input
                  type="text"
                  className="wp-setup-input"
                  placeholder="e.g. XK7PLQ"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                />
              </div>
              <button
                className="wp-setup-btn primary"
                onClick={handleJoinRoom}
                disabled={isLoading || joinCode.length < 6}
              >
                {isLoading ? "Joining..." : "Join Room"}
              </button>
            </div>
          )}

          {error && <div className="wp-setup-error">{error}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
