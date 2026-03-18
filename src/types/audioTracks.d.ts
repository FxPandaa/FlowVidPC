// Type declarations for HTML5 AudioTrackList (experimental API)

interface AudioTrack {
  id: string;
  kind: string;
  label: string;
  language: string;
  enabled: boolean;
}

interface AudioTrackList {
  readonly length: number;
  [index: number]: AudioTrack;
  getTrackById(id: string): AudioTrack | null;
  onchange: ((this: AudioTrackList, ev: Event) => void) | null;
  onaddtrack: ((this: AudioTrackList, ev: Event) => void) | null;
  onremovetrack: ((this: AudioTrackList, ev: Event) => void) | null;
}

declare global {
  interface HTMLVideoElement {
    audioTracks?: AudioTrackList;
  }
}

export {};
