<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="FlowVid" width="80" />
</p>

<h1 align="center">FlowVid Desktop</h1>

<p align="center">
  <strong>Stream everything. One app. No limits.</strong><br />
  A native desktop streaming client for Windows, macOS, and Linux.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## What is FlowVid?

FlowVid is a native streaming application that gives you a Netflix-like experience for all your media. Browse, search, and stream movies and TV shows through user-installed third-party addons (Stremio addon protocol) — no built-in scrapers, no hardcoded sources.

---

## Features

- **Addon-based streaming** — install third-party addons to find sources; no built-in scrapers
- **Dual player engine** — HTML5 for quick playback, embedded MPV for full codec support (4K, HDR10, Dolby Vision, DTS, Atmos)
- **Cross-device sync** — library, watch history, settings, profiles, and collections sync via the FlowVid API
- **Up to 8 profiles** per account with separate libraries and preferences
- **30+ subtitle languages** via OpenSubtitles with timing offset and appearance customization
- **Skip intro / Skip outro** via AniSkip + IntroDB
- **Auto-play next episode** with seamless source resolution
- **Discover page** — filter by genre, year, rating, language (powered by TMDB)
- **Calendar** — track upcoming episodes for shows in your library

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Tauri v2 (Rust) |
| Frontend | React 18, TypeScript, Zustand |
| Video Player | Embedded MPV (libmpv) + HTML5 fallback |
| Metadata | Cinemeta + TMDB enrichment |
| Subtitles | OpenSubtitles |
| Billing | Creem (Merchant of Record) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- Platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# Clone
git clone https://github.com/fxpandaa/FlowVidPC.git
cd FlowVidPC

# Install dependencies
npm install

# Create env file
cp .env.example .env

# Run in development
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## Related Repos

| Repo | Description |
|------|-------------|
| [FlowVidApp](https://github.com/fxpandaa/FlowVidApp) | Mobile app (Android) |
| [FlowVidTV](https://github.com/fxpandaa/FlowVidTV) | Android TV app |

---

## License

MIT

---

## Disclaimer

FlowVid does not host, store, or distribute any content. It is a player interface that connects to user-installed third-party addons. Users are solely responsible for the addons they install and the content they access.
