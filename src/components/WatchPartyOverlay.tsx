import { useState, useRef, useEffect } from "react";
import { X } from "./Icons";
import { useWatchPartyStore } from "../stores/watchPartyStore";
import "./WatchPartyOverlay.css";

interface WatchPartyOverlayProps {
  onSendChat: (text: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

export function WatchPartyOverlay({ onSendChat, onLeave, onClose }: WatchPartyOverlayProps) {
  const { roomCode, participants, chatMessages, syncState, isHost } = useWatchPartyStore();
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  const handleSend = () => {
    if (chatInput.trim()) {
      onSendChat(chatInput.trim());
      setChatInput("");
    }
  };

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="wp-overlay">
      <div className="wp-overlay-header">
        <div className="wp-overlay-title">Watch Party</div>
        <button className="wp-overlay-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Room code */}
      <div className="wp-overlay-code" onClick={handleCopyCode} title="Click to copy">
        <span className="wp-overlay-code-label">Room Code</span>
        <span className="wp-overlay-code-value">{roomCode}</span>
        <span className="wp-overlay-code-copy">{copied ? "Copied!" : "Copy"}</span>
      </div>

      {/* Sync status */}
      <div className={`wp-overlay-sync ${syncState}`}>
        <span className="wp-overlay-sync-dot" />
        {syncState === "synced" ? "Synced" : syncState === "correcting" ? "Syncing..." : "Buffering..."}
      </div>

      {/* Participants */}
      <div className="wp-overlay-participants">
        <div className="wp-overlay-section-title">
          Participants ({participants.length})
        </div>
        {participants.map((p) => (
          <div key={p.userId} className="wp-overlay-participant">
            <div className="wp-overlay-avatar">
              {p.username.charAt(0).toUpperCase()}
            </div>
            <span className="wp-overlay-username">{p.username}</span>
            {p.isHost && <span className="wp-overlay-host-badge">Host</span>}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div className="wp-overlay-chat">
        <div className="wp-overlay-section-title">Chat</div>
        <div className="wp-overlay-messages">
          {chatMessages.length === 0 && (
            <div className="wp-overlay-chat-empty">No messages yet</div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className="wp-overlay-message">
              <span className="wp-overlay-msg-user">{msg.username}</span>
              <span className="wp-overlay-msg-text">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="wp-overlay-chat-input">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            maxLength={500}
          />
        </div>
      </div>

      {/* Leave button */}
      <button className="wp-overlay-leave" onClick={onLeave}>
        {isHost ? "Close Room" : "Leave Party"}
      </button>
    </div>
  );
}
