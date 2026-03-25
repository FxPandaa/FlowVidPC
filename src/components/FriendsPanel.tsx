/**
 * FlowVid Desktop - Friends Panel
 * Shows friends list with activity, friend requests, add friend, and party invites.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWatchPartyStore } from "../stores/watchPartyStore";
import { watchPartyService } from "../services/watchPartyService";
import { authenticatedFetch } from "../stores/authStore";
import { useFeatureGate } from "../hooks/useFeatureGate";
import { UpgradePrompt } from "./UpgradePrompt";
import "./FriendsPanel.css";

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

function formatCode(code: string): string {
  return code.length >= 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function FriendsPanel() {
  const navigate = useNavigate();
  const { friends, friendRequests, partyInvites, friendsLoading, isInParty, roomCode } = useWatchPartyStore();
  const { canWatchParty } = useFeatureGate();
  const [addCode, setAddCode] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Connect socket and load own friend code on mount
  useEffect(() => {
    watchPartyService.ensureConnected();
    authenticatedFetch(`${API_URL}/friends/code`)
      .then((res) => res.json())
      .then((data) => setMyFriendCode(data.data?.friendCode || null))
      .catch(() => {});
  }, []);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = addCode.trim().toUpperCase();
    if (!code) return;

    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const res = await authenticatedFetch(`${API_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendCode: code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send request");

      if (data.data?.status === "accepted") {
        setAddSuccess("You're now friends!");
        watchPartyService.notifyFriendAccepted(data.data.targetUserId);
      } else {
        setAddSuccess("Friend request sent!");
        if (data.data?.targetUserId) {
          watchPartyService.notifyFriendRequestSent(data.data.targetUserId, data.data.friendshipId || "");
        }
      }
      setAddCode("");
      watchPartyService.loadFriends();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setAddLoading(false);
      setTimeout(() => { setAddSuccess(null); setAddError(null); }, 4000);
    }
  };

  const handleAccept = async (friendshipId: string, fromUserId: string) => {
    setActionLoading(friendshipId);
    try {
      const res = await authenticatedFetch(`${API_URL}/friends/accept/${friendshipId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to accept");
      useWatchPartyStore.getState().removeFriendRequest(friendshipId);
      watchPartyService.notifyFriendAccepted(fromUserId);
      watchPartyService.loadFriends();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      const res = await authenticatedFetch(`${API_URL}/friends/decline/${friendshipId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to decline");
      useWatchPartyStore.getState().removeFriendRequest(friendshipId);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnfriend = async (userId: string) => {
    try {
      const res = await authenticatedFetch(`${API_URL}/friends/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unfriend");
      useWatchPartyStore.getState().removeFriend(userId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInvite = (friendUserId: string, mediaTitle: string) => {
    if (!isInParty || !roomCode) return;
    watchPartyService.inviteFriend(friendUserId, roomCode, mediaTitle);
  };

  const handleAcceptInvite = async (code: string) => {
    if (!canWatchParty) {
      setShowUpgrade(true);
      return;
    }
    try {
      const result = await watchPartyService.joinRoom(code);
      useWatchPartyStore.getState().removePartyInvite(code);
      if (result.media) {
        const m = result.media;
        const path = m.season && m.episode
          ? `/player/${m.type}/${m.imdbId}/${m.season}/${m.episode}`
          : `/player/${m.type}/${m.imdbId}`;
        navigate(path);
      }
    } catch (err: any) {
      if (err?.message === "SUBSCRIPTION_REQUIRED") {
        setShowUpgrade(true);
      } else {
        console.error("Failed to join room:", err);
      }
    }
  };

  const handleCopyCode = () => {
    if (myFriendCode) {
      navigator.clipboard.writeText(myFriendCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  return (
    <div className="friends-panel">
      <h1>Friends</h1>

      {/* Your Friend Code */}
      {myFriendCode && (
        <section className="friends-section friends-my-code">
          <h2>Your Friend Code</h2>
          <p className="friends-code-desc">Share this code so others can add you</p>
          <div className="friends-code-display" onClick={handleCopyCode}>
            <span className="friends-code-value">{formatCode(myFriendCode)}</span>
            <span className="friends-code-copy">{codeCopied ? "Copied!" : "Copy"}</span>
          </div>
        </section>
      )}

      {/* Add Friend */}
      <section className="friends-section">
        <h2>Add Friend</h2>
        <form className="friends-add-form" onSubmit={handleAddFriend}>
          <input
            type="text"
            className="friends-add-input"
            placeholder="Enter friend code (XXXX-XXXX)..."
            value={addCode.length > 4 ? `${addCode.slice(0, 4)}-${addCode.slice(4)}` : addCode}
            onChange={(e) => setAddCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            maxLength={9}
            disabled={addLoading}
          />
          <button className="btn btn-secondary friends-add-btn" type="submit" disabled={addLoading || !addCode.trim()}>
            {addLoading ? "Sending..." : "Add"}
          </button>
        </form>
        {addError && <p className="friends-feedback friends-error">{addError}</p>}
        {addSuccess && <p className="friends-feedback friends-success">{addSuccess}</p>}
      </section>

      {/* Party Invites */}
      {partyInvites.length > 0 && (
        <section className="friends-section">
          <h2>Watch Party Invites</h2>
          <div className="friends-list">
            {partyInvites.map((invite) => (
              <div key={invite.roomCode} className="friend-item friend-invite-item">
                <div className="friend-info">
                  <span className="friend-name">{invite.fromUsername}</span>
                  <span className="friend-activity-text">Invited you to watch {invite.mediaTitle}</span>
                </div>
                <div className="friend-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleAcceptInvite(invite.roomCode)}>
                    Join
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => useWatchPartyStore.getState().removePartyInvite(invite.roomCode)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Friend Requests */}
      {friendRequests.length > 0 && (
        <section className="friends-section">
          <h2>Friend Requests ({friendRequests.length})</h2>
          <div className="friends-list">
            {friendRequests.map((req) => (
              <div key={req.friendshipId} className="friend-item friend-request-item">
                <div className="friend-info">
                  <div className="friend-avatar">{req.fromUsername[0].toUpperCase()}</div>
                  <span className="friend-name">{req.fromUsername}</span>
                </div>
                <div className="friend-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={actionLoading === req.friendshipId}
                    onClick={() => handleAccept(req.friendshipId, req.fromUserId)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={actionLoading === req.friendshipId}
                    onClick={() => handleDecline(req.friendshipId)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Online Friends */}
      <section className="friends-section">
        <h2>Online ({onlineFriends.length})</h2>
        {friendsLoading && friends.length === 0 ? (
          <p className="friends-empty">Loading friends...</p>
        ) : onlineFriends.length === 0 ? (
          <p className="friends-empty">No friends online</p>
        ) : (
          <div className="friends-list">
            {onlineFriends.map((friend) => (
              <div key={friend.userId} className="friend-item">
                <div className="friend-info">
                  <div className="friend-avatar online">
                    {friend.username[0].toUpperCase()}
                    <span className="online-dot" />
                  </div>
                  <div className="friend-details">
                    <span className="friend-name">{friend.username}</span>
                    {friend.activities.length > 0 ? (
                      <div className="friend-activities-group">
                        {friend.activities.map((act, i) => (
                          <span key={i} className="friend-activity-text">
                            {act.profileName ? `${act.profileName}: ` : ""}Watching {act.title}
                            {act.season != null && ` S${act.season}`}
                            {act.episode != null && `E${act.episode}`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="friend-activity-text friend-idle">Online</span>
                    )}
                  </div>
                </div>
                <div className="friend-actions">
                  {isInParty && roomCode && friend.activities.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleInvite(friend.userId, useWatchPartyStore.getState().media?.title || "")}
                      title="Invite to your watch party"
                    >
                      Invite
                    </button>
                  )}
                  {friend.activities.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/details/${friend.activities[0].mediaType}/${friend.activities[0].imdbId}`)}
                      title="View what they're watching"
                    >
                      View
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm btn-danger-text"
                    onClick={() => handleUnfriend(friend.userId)}
                    title="Unfriend"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Offline Friends */}
      {offlineFriends.length > 0 && (
        <section className="friends-section">
          <h2>Offline ({offlineFriends.length})</h2>
          <div className="friends-list">
            {offlineFriends.map((friend) => (
              <div key={friend.userId} className="friend-item friend-offline">
                <div className="friend-info">
                  <div className="friend-avatar">
                    {friend.username[0].toUpperCase()}
                  </div>
                  <span className="friend-name">{friend.username}</span>
                </div>
                <div className="friend-actions">
                  <button
                    className="btn btn-ghost btn-sm btn-danger-text"
                    onClick={() => handleUnfriend(friend.userId)}
                    title="Unfriend"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {friends.length === 0 && friendRequests.length === 0 && !friendsLoading && (
        <p className="friends-empty-global">
          Share your friend code to connect with others. See what your friends are watching and invite them to watch parties.
        </p>
      )}

      {showUpgrade && <UpgradePrompt context="watchparty" onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
