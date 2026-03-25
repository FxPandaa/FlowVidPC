/**
 * FlowVid Desktop - Watch Party Store
 * Manages watch party room state, participants, and chat (session only, no persistence).
 */

import { create } from "zustand";

export interface Participant {
  userId: string;
  username: string;
  isHost: boolean;
}

export interface ChatMessage {
  userId: string;
  username: string;
  text: string;
  ts: number;
}

export interface WatchPartyMedia {
  imdbId: string;
  type: string;
  title: string;
  season?: number | null;
  episode?: number | null;
  poster?: string | null;
}

export interface FriendActivity {
  profileName?: string | null;
  imdbId: string;
  mediaType: string;
  title: string;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  poster?: string | null;
}

export interface Friend {
  userId: string;
  username: string;
  friendshipId: string;
  isOnline: boolean;
  activities: FriendActivity[];
}

export interface FriendRequest {
  friendshipId: string;
  fromUserId: string;
  fromUsername: string;
  createdAt: string;
}

export interface PartyInvite {
  roomCode: string;
  fromUserId: string;
  fromUsername: string;
  mediaTitle: string;
  ts: number;
}

interface WatchPartyState {
  // Room state
  isInParty: boolean;
  isHost: boolean;
  roomCode: string | null;
  roomId: string | null;
  media: WatchPartyMedia | null;

  // Participants
  participants: Participant[];

  // Chat
  chatMessages: ChatMessage[];

  // Sync state
  syncState: "synced" | "correcting" | "buffering";

  // Friends
  friends: Friend[];
  friendRequests: FriendRequest[];
  partyInvites: PartyInvite[];
  friendsLoading: boolean;

  // Actions — room
  setRoom: (roomId: string, roomCode: string, isHost: boolean, media: WatchPartyMedia) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  addMessage: (message: ChatMessage) => void;
  setSyncState: (state: "synced" | "correcting" | "buffering") => void;
  leaveParty: () => void;

  // Actions — friends
  setFriends: (friends: Friend[]) => void;
  setFriendRequests: (requests: FriendRequest[]) => void;
  setFriendsLoading: (loading: boolean) => void;
  updateFriendOnline: (userId: string, isOnline: boolean) => void;
  updateFriendActivity: (userId: string, activities: FriendActivity[]) => void;
  addFriendRequest: (request: FriendRequest) => void;
  removeFriendRequest: (friendshipId: string) => void;
  addPartyInvite: (invite: PartyInvite) => void;
  removePartyInvite: (roomCode: string) => void;
  removeFriend: (userId: string) => void;

  clearAll: () => void;
}

const initialState = {
  isInParty: false,
  isHost: false,
  roomCode: null as string | null,
  roomId: null as string | null,
  media: null as WatchPartyMedia | null,
  participants: [] as Participant[],
  chatMessages: [] as ChatMessage[],
  syncState: "synced" as const,
  friends: [] as Friend[],
  friendRequests: [] as FriendRequest[],
  partyInvites: [] as PartyInvite[],
  friendsLoading: false,
};

export const useWatchPartyStore = create<WatchPartyState>()((set) => ({
  ...initialState,

  setRoom: (roomId, roomCode, isHost, media) =>
    set({ isInParty: true, roomId, roomCode, isHost, media, chatMessages: [] }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((s) => ({
      participants: s.participants.some((p) => p.userId === participant.userId)
        ? s.participants
        : [...s.participants, participant],
    })),

  removeParticipant: (userId) =>
    set((s) => ({
      participants: s.participants.filter((p) => p.userId !== userId),
    })),

  addMessage: (message) =>
    set((s) => ({
      chatMessages: [...s.chatMessages.slice(-99), message], // Keep last 100 messages
    })),

  setSyncState: (syncState) => set({ syncState }),

  leaveParty: () => set((s) => ({
    isInParty: false,
    isHost: false,
    roomCode: null,
    roomId: null,
    media: null,
    participants: [],
    chatMessages: [],
    syncState: "synced" as const,
    // Preserve friends state across party leave
    friends: s.friends,
    friendRequests: s.friendRequests,
    partyInvites: s.partyInvites,
    friendsLoading: s.friendsLoading,
  })),

  // Friends actions
  setFriends: (friends) => set({ friends }),

  setFriendRequests: (friendRequests) => set({ friendRequests }),

  setFriendsLoading: (friendsLoading) => set({ friendsLoading }),

  updateFriendOnline: (userId, isOnline) =>
    set((s) => ({
      friends: s.friends.map((f) =>
        f.userId === userId ? { ...f, isOnline } : f,
      ),
    })),

  updateFriendActivity: (userId, activities) =>
    set((s) => ({
      friends: s.friends.map((f) =>
        f.userId === userId ? { ...f, activities } : f,
      ),
    })),

  addFriendRequest: (request) =>
    set((s) => ({
      friendRequests: s.friendRequests.some((r) => r.friendshipId === request.friendshipId)
        ? s.friendRequests
        : [...s.friendRequests, request],
    })),

  removeFriendRequest: (friendshipId) =>
    set((s) => ({
      friendRequests: s.friendRequests.filter((r) => r.friendshipId !== friendshipId),
    })),

  addPartyInvite: (invite) =>
    set((s) => ({
      partyInvites: [...s.partyInvites.filter((i) => i.roomCode !== invite.roomCode), invite],
    })),

  removePartyInvite: (roomCode) =>
    set((s) => ({
      partyInvites: s.partyInvites.filter((i) => i.roomCode !== roomCode),
    })),

  removeFriend: (userId) =>
    set((s) => ({
      friends: s.friends.filter((f) => f.userId !== userId),
    })),

  clearAll: () => set(initialState),
}));
