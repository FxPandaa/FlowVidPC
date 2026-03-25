/**
 * FlowVid Desktop - Watch Party Service
 * Socket.io client singleton for real-time watch party sync.
 * Connects to the FlowVid API Socket.io server and handles room management,
 * position sync, and chat.
 */

import { io, Socket } from "socket.io-client";
import { useWatchPartyStore, WatchPartyMedia, FriendActivity } from "../stores/watchPartyStore";
import { useAuthStore } from "../stores/authStore";
import { embeddedMpvService } from "./embeddedMpvService";
import { authenticatedFetch } from "../stores/authStore";

type ToastCallback = (toast: { title: string; message: string; action?: { label: string; onClick: () => void } }) => void;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onToast: ToastCallback | null = null;

const API_URL = import.meta.env.VITE_API_URL || "https://api.flow-vid.com";

class WatchPartyService {
  private socket: Socket | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private ignoreSeekUntil = 0;
  private propertyUnsubscribe: (() => void) | null = null;

  /**
   * Connect the Socket.io client using the current auth token
   */
  connect(): void {
    const token = useAuthStore.getState().token;
    if (!token || this.socket?.connected) return;

    this.socket = io(API_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      console.log("[WatchParty] Connected to server");
      // Rejoin room if we were in one before disconnect
      const store = useWatchPartyStore.getState();
      if (store.isInParty && store.roomCode) {
        this.socket?.emit("room:join", { code: store.roomCode });
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WatchParty] Disconnected:", reason);
    });

    // Room events
    this.socket.on("room:participant_joined", (data) => {
      useWatchPartyStore.getState().addParticipant({
        userId: data.userId,
        username: data.username,
        isHost: data.isHost,
      });
    });

    this.socket.on("room:participant_left", (data) => {
      useWatchPartyStore.getState().removeParticipant(data.userId);
    });

    this.socket.on("room:closed", () => {
      this.stopHostBroadcast();
      useWatchPartyStore.getState().leaveParty();
    });

    // Sync events (guest receives these from host)
    this.socket.on("room:sync", (data) => {
      this.handleSync(data);
    });

    this.socket.on("room:play", (data) => {
      if (useWatchPartyStore.getState().isHost) return;
      this.ignoreSeekUntil = Date.now() + 1000;
      useWatchPartyStore.getState().setSyncState("correcting");
      embeddedMpvService.seek(data.position);
      embeddedMpvService.play();
      setTimeout(() => useWatchPartyStore.getState().setSyncState("synced"), 500);
    });

    this.socket.on("room:pause", (data) => {
      if (useWatchPartyStore.getState().isHost) return;
      this.ignoreSeekUntil = Date.now() + 1000;
      useWatchPartyStore.getState().setSyncState("correcting");
      embeddedMpvService.seek(data.position);
      embeddedMpvService.pause();
      setTimeout(() => useWatchPartyStore.getState().setSyncState("synced"), 500);
    });

    this.socket.on("room:seek", (data) => {
      if (useWatchPartyStore.getState().isHost) return;
      this.ignoreSeekUntil = Date.now() + 1000;
      useWatchPartyStore.getState().setSyncState("correcting");
      embeddedMpvService.seek(data.position);
      setTimeout(() => useWatchPartyStore.getState().setSyncState("synced"), 500);
    });

    // Chat
    this.socket.on("room:chat", (data) => {
      useWatchPartyStore.getState().addMessage({
        userId: data.userId,
        username: data.username,
        text: data.text,
        ts: data.ts,
      });
    });

    // ====== Friend events ======

    this.socket.on("friend:online", (data: { userId: string; username: string }) => {
      useWatchPartyStore.getState().updateFriendOnline(data.userId, true);
    });

    this.socket.on("friend:offline", (data: { userId: string }) => {
      useWatchPartyStore.getState().updateFriendOnline(data.userId, false);
    });

    this.socket.on("friend:activity_update", (data: { userId: string; username: string; activities?: Array<{ profileName?: string; imdbId: string; mediaType?: string; title: string; season?: number; episode?: number; episodeTitle?: string; poster?: string }>; imdbId?: string | null; title?: string | null; mediaType?: string; season?: number; episode?: number; episodeTitle?: string; poster?: string }) => {
      // New format: activities array
      if (data.activities) {
        const activities: FriendActivity[] = data.activities.map((a) => ({
          profileName: a.profileName,
          imdbId: a.imdbId,
          mediaType: a.mediaType || "movie",
          title: a.title,
          season: a.season,
          episode: a.episode,
          episodeTitle: a.episodeTitle,
          poster: a.poster,
        }));
        useWatchPartyStore.getState().updateFriendActivity(data.userId, activities);
      } else {
        // Legacy fallback: single activity (backwards compat during rollout)
        const activities: FriendActivity[] = data.title
          ? [{ imdbId: data.imdbId!, mediaType: data.mediaType || "movie", title: data.title, season: data.season, episode: data.episode, episodeTitle: data.episodeTitle, poster: data.poster }]
          : [];
        useWatchPartyStore.getState().updateFriendActivity(data.userId, activities);
      }
    });

    this.socket.on("friend:request_received", (data: { friendshipId: string; fromUserId: string; fromUsername: string }) => {
      useWatchPartyStore.getState().addFriendRequest({
        friendshipId: data.friendshipId,
        fromUserId: data.fromUserId,
        fromUsername: data.fromUsername,
        createdAt: new Date().toISOString(),
      });
      onToast?.({
        title: "Friend Request",
        message: `${data.fromUsername} sent you a friend request`,
      });
    });

    this.socket.on("friend:request_accepted", (data: { userId: string; username: string }) => {
      onToast?.({
        title: "Friend Accepted",
        message: `${data.username} accepted your friend request`,
      });
      // Reload friends list
      this.loadFriends();
    });

    this.socket.on("friend:invite_received", (data: { roomCode: string; fromUserId: string; fromUsername: string; mediaTitle: string }) => {
      useWatchPartyStore.getState().addPartyInvite({
        ...data,
        ts: Date.now(),
      });
      onToast?.({
        title: "Watch Party Invite",
        message: `${data.fromUsername} invited you to watch ${data.mediaTitle}`,
        action: {
          label: "Join",
          onClick: () => {
            this.joinRoom(data.roomCode).catch((err) => {
              if (err?.message === "SUBSCRIPTION_REQUIRED") {
                onToast?.({ title: "FlowVid+ Required", message: "You need a FlowVid+ subscription to join watch parties." });
              } else {
                onToast?.({ title: "Failed to Join", message: err?.message || "Could not join the watch party." });
              }
            });
          },
        },
      });
    });
  }

  /**
   * Ensure socket is connected (lazy connect for social features)
   */
  ensureConnected(): void {
    if (!this.socket?.connected) {
      this.connect();
    }
  }

  /**
   * Disconnect Socket.io
   */
  disconnect(): void {
    this.stopHostBroadcast();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Create a new watch party room via REST API, then join via Socket.io
   */
  async createRoom(media: WatchPartyMedia): Promise<string> {
    const res = await authenticatedFetch(`${API_URL}/watchparty/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaImdbId: media.imdbId,
        mediaType: media.type,
        mediaTitle: media.title,
        mediaSeason: media.season,
        mediaEpisode: media.episode,
        mediaPoster: media.poster,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create room" }));
      throw new Error(err.error || "Failed to create room");
    }

    const data = await res.json();
    const roomCode: string = data.data.roomCode;

    // Now join via Socket.io
    await this.joinRoom(roomCode);

    return roomCode;
  }

  /**
   * Join an existing room via Socket.io
   */
  async joinRoom(code: string): Promise<{ media: WatchPartyMedia }> {
    if (!this.socket?.connected) {
      this.connect();
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
        this.socket?.once("connect", () => { clearTimeout(timeout); resolve(); });
      });
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit("room:join", { code: code.toUpperCase() }, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        const room = response.room;
        const store = useWatchPartyStore.getState();
        store.setRoom(room.roomId, room.roomCode, room.isHost, room.media);
        store.setParticipants(room.participants);

        resolve({ media: room.media });
      });
    });
  }

  /**
   * Leave the current room
   */
  leaveRoom(): void {
    this.stopHostBroadcast();
    this.socket?.emit("room:leave");
    useWatchPartyStore.getState().leaveParty();
  }

  /**
   * Send a chat message
   */
  sendChat(text: string): void {
    if (!text.trim()) return;
    this.socket?.emit("room:chat", { text: text.trim() });
  }

  /**
   * Start broadcasting position as host (called when PlayerPage mounts with isHost)
   */
  startHostBroadcast(): void {
    if (this.syncInterval) return;

    // Subscribe to MPV property changes for instant play/pause/seek events
    let lastPaused: boolean | null = null;
    let lastPosition = 0;
    let lastBroadcastTime = 0;

    this.propertyUnsubscribe = embeddedMpvService.onPropertyChange((state) => {
      const now = Date.now();
      const pos = state.position ?? lastPosition;
      const paused = state.isPaused ?? lastPaused;

      // Detect play/pause changes
      if (lastPaused !== null && paused !== null && paused !== lastPaused) {
        if (paused) {
          this.socket?.emit("room:pause", { position: pos });
        } else {
          this.socket?.emit("room:play", { position: pos });
        }
      }
      lastPaused = paused;

      // Detect seek (>3s jump from expected position)
      const expectedPos = lastPosition + (now - lastBroadcastTime) / 1000;
      if (lastBroadcastTime > 0 && Math.abs(pos - expectedPos) > 3) {
        this.socket?.emit("room:seek", { position: pos });
      }

      lastPosition = pos;
    });

    // Periodic sync broadcast every 5 seconds
    this.syncInterval = setInterval(() => {
      const state = embeddedMpvService.getState();
      if (!state) return;

      this.socket?.emit("room:sync", {
        position: state.position,
        paused: state.isPaused,
        ts: Date.now(),
      });
    }, 5000);
  }

  /**
   * Stop broadcasting position
   */
  stopHostBroadcast(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.propertyUnsubscribe) {
      this.propertyUnsubscribe();
      this.propertyUnsubscribe = null;
    }
  }

  /**
   * Handle sync event from host (guest side)
   */
  private handleSync(payload: { position: number; paused: boolean; ts: number }): void {
    const store = useWatchPartyStore.getState();
    if (store.isHost) return; // Host doesn't sync from itself

    // Skip if we just did a correction
    if (Date.now() < this.ignoreSeekUntil) return;

    const expected = payload.position + (Date.now() - payload.ts) / 1000;
    const currentState = embeddedMpvService.getState();
    if (!currentState) return;

    const drift = Math.abs(currentState.position - expected);

    if (drift > 1.5) {
      store.setSyncState("correcting");
      this.ignoreSeekUntil = Date.now() + 1500;
      embeddedMpvService.seek(expected);
      setTimeout(() => store.setSyncState("synced"), 1000);
    }

    // Ensure play/pause state matches
    if (payload.paused && !currentState.isPaused) {
      embeddedMpvService.pause();
    } else if (!payload.paused && currentState.isPaused) {
      embeddedMpvService.play();
    }
  }

  // ====== Friends & Activity ======

  /**
   * Register a callback for in-app toast notifications
   */
  setToastHandler(handler: ToastCallback): void {
    onToast = handler;
  }

  /**
   * Load friends list from REST API into store
   */
  async loadFriends(): Promise<void> {
    const store = useWatchPartyStore.getState();
    store.setFriendsLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        authenticatedFetch(`${API_URL}/friends`),
        authenticatedFetch(`${API_URL}/friends/requests`),
      ]);

      if (friendsRes.ok) {
        const data = await friendsRes.json();
        store.setFriends(data.data ?? []);
      }
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        store.setFriendRequests(data.data ?? []);
      }
    } catch (e) {
      console.error("[WatchParty] Failed to load friends:", e);
    } finally {
      store.setFriendsLoading(false);
    }
  }

  /**
   * Broadcast what the user is currently watching (called from PlayerPage)
   */
  broadcastActivity(media: { imdbId: string; mediaType: string; title: string; season?: number; episode?: number; episodeTitle?: string; poster?: string; profileName?: string }): void {
    this.ensureConnected();
    this.socket?.emit("activity:update", media);
  }

  /**
   * Clear activity (called when leaving PlayerPage)
   */
  clearActivity(): void {
    this.socket?.emit("activity:clear");
  }

  /**
   * Notify the target user that a friend request was sent (via Socket.io)
   */
  notifyFriendRequestSent(targetUserId: string, friendshipId: string): void {
    this.socket?.emit("friend:request_sent", { targetUserId, friendshipId });
  }

  /**
   * Notify the requester that their request was accepted
   */
  notifyFriendAccepted(targetUserId: string): void {
    this.socket?.emit("friend:accepted", { targetUserId });
  }

  /**
   * Invite a friend to your current watch party room
   */
  inviteFriend(targetUserId: string, roomCode: string, mediaTitle: string): void {
    this.socket?.emit("watchparty:invite", { targetUserId, roomCode, mediaTitle });
  }

  /**
   * Check if connected to Socket.io
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const watchPartyService = new WatchPartyService();
