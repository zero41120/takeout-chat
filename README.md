# Takeout Chat

A private, client-side explorer for YouTube Live Chat history exported via Google Takeout. All parsing and processing runs locally in the browser.

## Tech Stack & Architecture

- **Runtime & Tooling:** [Bun](https://bun.sh), [Vite](https://vite.dev), TypeScript
- **Frontend:** React 19, Tailwind CSS, Lucide icons
- **State Management:** [Zustand](https://github.com/pmndrs/zustand) (`stream-info.ts`, `channel-info.ts`)
- **i18n:** `react-i18next` supporting English (`en_US`) and Traditional Chinese (`zh_TW`)
- **Linting & Formatting:** Prettier + [Oxlint](https://oxc.rs)

### Core Architecture

- **Local Parser (`src/App.tsx`):** Reads Google Takeout CSV exports in-browser (messages, Super Chats, memberships/gifts, currency conversion).
- **Stream Helper Userscript (`public/takeout-chat-stream-info.user.js`):** An optional Tampermonkey bridge communicating via window CustomEvents. Fetches YouTube initial player responses and metadata without requiring a YouTube API key.
- **Player & Offsets (`src/youtube-player.ts`, `src/stream-info.ts`):** Calculates timestamp-to-video playback offsets and controls the embedded YouTube IFrame API.
- **Channel Enrichment (`src/channel-info.ts`):** Lazily resolves channel avatars and names, caching results locally in `localStorage`.

## Development

```bash
# Install dependencies
bun install

# Start local dev server
bun run dev

# Format & Lint
bun run lint

# Production build
bun run build
```

## Deployment

```bash
bun run deploy
```

This builds `dist` and publishes it to the `gh-pages` branch.
