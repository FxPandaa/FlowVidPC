<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="FlowVid" width="80" />
</p>

<h1 align="center">FlowVid Desktop</h1>

<p align="center">
  <strong>Stream everything. One app. No limits.</strong><br />
  FlowVid for Windows.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## What is FlowVid?

FlowVid is a native streaming application that gives you a Netflix-like experience for all your media. Browse, search, and stream movies and TV shows through user-installed third-party addons. No built-in scrapers, no hardcoded sources.

---

## Features

- **Addon-based streaming** — install third-party addons to find sources, no built-in scrapers
- **Dual player engine** — HTML5 for quick playback, embedded MPV for full codec support (4K, HDR10, Dolby Vision, DTS, Atmos)
- **Cross-device sync** — library, watch history, settings, profiles, and collections
- **Up to 8 profiles** per account with separate libraries and preferences
- **30+ subtitle languages** via OpenSubtitles, with timing offset and appearance customization
- **Skip intro / Skip outro** via AniSkip + IntroDB
- **Auto-play next episode**
- **Discover page** powered by TMDB, filterable by genre, year, rating, and language
- **Calendar** to track upcoming episodes for shows in your library

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Tauri v2 (Rust) |
| Frontend | React 18, TypeScript, Zustand |
| Video Player | Embedded MPV (libmpv) + HTML5 fallback |
| Metadata | Cinemeta + TMDB enrichment |
| Subtitles | Embedded + OpenSubtitles |

---

## Download

Head to the [Releases](https://github.com/fxpandaa/FlowVidPC/releases) page to download the latest installer for your platform.

---

## Related Apps

| App | Platform |
|-----|----------|
| [FlowVid Mobile](https://github.com/fxpandaa/FlowVidApp) | Android |
| [FlowVid TV](https://github.com/fxpandaa/FlowVidTV) | Android TV |

---

## License

MIT

---

## Disclaimer

FlowVid does not host, store, or distribute any content. It is a player interface that connects to user-installed third-party addons. Users are solely responsible for the addons they install and the content they access.
