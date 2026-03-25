import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWatchPartyStore } from "../stores/watchPartyStore";
import { watchPartyService } from "../services/watchPartyService";
import { authenticatedFetch } from "../stores/authStore";
import { useFeatureGate } from "../hooks/useFeatureGate";
import "./FriendsActivityPanel.css";

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

function formatCode(code: string): string {
  return code.length >= 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

interface Props {
  onClose: () => void;
}

export function FriendsActivityPanel({ onClose }: Props) {
  const navigate = useNavigate();
  const { friends, friendRequests, partyInvites } = useWatchPartyStore();
  const { canWatchParty } = useFeatureGate();
  const [tab, setTab] = useState<"activity" | "join">("activity");
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    watchPartyService.ensureConnected();
    authenticatedFetch(`${API_URL}/friends/code`)
      .then((res) => res.json())
      .then((data) => setMyFriendCode(data.data?.friendCode || null))
      .catch(() => {});
  }, []);

  const handleCopyCode = () => {
    if (myFriendCode) {
      navigator.clipboard.writeText(myFriendCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleJoinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) {
      setJoinError("Enter a valid 6-character room code");
      return;
    }
    setJoinLoading(true);
    setJoinError(null);
    try {
      const result = await watchPartyService.joinRoom(code);
      onClose();
      if (result.media) {
        const m = result.media;
        const path = m.season && m.episode
          ? `/player/${m.type}/${m.imdbId}/${m.season}/${m.episode}`
          : `/player/${m.type}/${m.imdbId}`;
        navigate(path);
      }
    } catch (err: any) {
      setJoinError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleAcceptInvite = async (code: string) => {
    if (!canWatchParty) return;
    try {
      const result = await watchPartyService.joinRoom(code);
      useWatchPartyStore.getState().removePartyInvite(code);
      onClose();
      if (result.media) {
        const m = result.media;
        const path = m.season && m.episode
          ? `/player/${m.type}/${m.imdbId}/${m.season}/${m.episode}`
          : `/player/${m.type}/${m.imdbId}`;
        navigate(path);
      }
    } catch {
      /* handled silently */
    }
  };

  const onlineFriends = friends.filter((f) => f.isOnline);

  return (
    <div className="fap">
      {/* Your Friend Code - always visible at top */}
      {myFriendCode && (
        <div className="fap-code-bar" onClick={handleCopyCode} title="Click to copy your friend code">
          <span className="fap-code-label">Your Code</span>
          <span className="fap-code-value">{formatCode(myFriendCode)}</span>
          <span className="fap-code-copy">{codeCopied ? "Copied!" : "Copy"}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="fap-tabs">
        <button
          className={`fap-tab ${tab === "activity" ? "active" : ""}`}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          className={`fap-tab ${tab === "join" ? "active" : ""}`}
          onClick={() => setTab("join")}
        >
          Join Party
        </button>
      </div>

      <div className="fap-content">
        {tab === "activity" && (
          <>
            {/* Party Invites */}
            {partyInvites.length > 0 && (
              <div className="fap-section">
                <div className="fap-section-title">Watch Party Invites</div>
                {partyInvites.map((inv) => (
                  <div key={inv.roomCode} className="fap-invite-item">
                    <div className="fap-invite-info">
                      <span className="fap-invite-from">{inv.fromUsername}</span>
                      <span className="fap-invite-media">Watching {inv.mediaTitle}</span>
                    </div>
                    <button className="fap-invite-join" onClick={() => handleAcceptInvite(inv.roomCode)}>
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Friend Requests */}
            {friendRequests.length > 0 && (
              <div className="fap-section">
                <div className="fap-section-title">
                  Requests ({friendRequests.length})
                </div>
                {friendRequests.map((req) => (
                  <div key={req.friendshipId} className="fap-friend-item">
                    <div className="fap-avatar">{req.fromUsername[0].toUpperCase()}</div>
                    <span className="fap-friend-name">{req.fromUsername}</span>
                    <div className="fap-friend-actions">
                      <button
                        className="fap-action-btn accept"
                        onClick={async () => {
                          await authenticatedFetch(`${API_URL}/friends/accept/${req.friendshipId}`, { method: "POST" });
                          useWatchPartyStore.getState().removeFriendRequest(req.friendshipId);
                          watchPartyService.notifyFriendAccepted(req.fromUserId);
                          watchPartyService.loadFriends();
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="fap-action-btn decline"
                        onClick={async () => {
                          await authenticatedFetch(`${API_URL}/friends/decline/${req.friendshipId}`, { method: "POST" });
                          useWatchPartyStore.getState().removeFriendRequest(req.friendshipId);
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Online Friends */}
            <div className="fap-section">
              <div className="fap-section-title">
                Online ({onlineFriends.length})
              </div>
              {onlineFriends.length === 0 ? (
                <div className="fap-empty">No friends online</div>
              ) : (
                onlineFriends.map((friend) => (
                  <div key={friend.userId} className="fap-friend-item">
                    <div className="fap-avatar online">
                      {friend.username[0].toUpperCase()}
                      <span className="fap-online-dot" />
                    </div>
                    <div className="fap-friend-info">
                      <span className="fap-friend-name">{friend.username}</span>
                      {friend.activities.length > 0 ? (
                        <span className="fap-friend-activity">
                          {friend.activities[0].profileName ? `${friend.activities[0].profileName}: ` : ""}
                          Watching {friend.activities[0].title}
                          {friend.activities[0].season != null && ` S${friend.activities[0].season}`}
                          {friend.activities[0].episode != null && `E${friend.activities[0].episode}`}
                        </span>
                      ) : (
                        <span className="fap-friend-activity idle">Online</span>
                      )}
                    </div>
                    {friend.activities.length > 0 && (
                      <button
                        className="fap-view-btn"
                        onClick={() => {
                          onClose();
                          navigate(`/details/${friend.activities[0].mediaType}/${friend.activities[0].imdbId}`);
                        }}
                      >
                        View
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Link to full page */}
            <button
              className="fap-see-all"
              onClick={() => { onClose(); navigate("/friends"); }}
            >
              See All Friends
            </button>
          </>
        )}

        {tab === "join" && (
          <div className="fap-join">
            <p className="fap-join-desc">Enter a room code to join a friend's watch party.</p>
            <input
              type="text"
              className="fap-join-input"
              placeholder="e.g. XK7PLQ"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              maxLength={6}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
            />
            <button
              className="fap-join-btn"
              onClick={handleJoinRoom}
              disabled={joinLoading || joinCode.length < 6}
            >
              {joinLoading ? "Joining..." : "Join Room"}
            </button>
            {joinError && <p className="fap-join-error">{joinError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
