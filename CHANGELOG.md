# Changelog

## [2.0.6] - 2026-03-04

### 🔒 Security
- **SSRF fix in playlist loader** — The `loadPlaylists` function in the property inspector now validates the user-supplied Plex server URL before making any network request, and builds the outgoing fetch URL from `URL.origin` + `URLSearchParams` rather than raw string concatenation. This prevents a malicious or misconfigured server URL from redirecting the request to an internal network endpoint or injecting arbitrary path/query segments (CWE-918 / CodeQL `js/request-forgery`).

---

## [2.0.5] - 2026-03-03

### ✨ New Features
- **Playlist button** — New key action that displays the currently active Plex playlist on an LCD key. Tap to browse playlists.
- **Playlist Carousel** — New touch strip action that shows your Plex playlists in a scrollable view (poster art or text mode). Rotate the dial to browse, press to queue and play the selected playlist. Use the **Load Playlists** button in the action settings to populate your playlist library.

### 🐛 Bug Fixes
- **Buttons and strip stay bright when Plexamp is closed** — All button renderers and touch strip panels only dimmed on pause, remaining fully lit when Plexamp wasn't running (`stopped` state). All renderers now treat `stopped` identically to `paused`: album art gets a gray overlay, icons and text shift to dark gray, and all dial and touch inputs are blocked until Plexamp is running again.
- **"PLAYING" overlay overwritten by stale poster render** — Pressing the playlist carousel dial to queue a playlist showed a "PLAYING" confirmation overlay that could be immediately replaced by an in-flight async poster image load completing milliseconds later, writing directly to the touch strip and erasing the overlay. An overlay guard inside the async render callback now discards the render if an overlay is already active.
- **Plugin freezes album art and track info mid-session** — Four compounding issues fixed together:
  - **`wait=0` on timeline poll** — Plexamp's `/player/timeline/poll` endpoint holds the connection open until a state change when `wait` is omitted. Combined with a 1-second poll interval and 5-second timeout, up to 5 concurrent hanging requests could pile up. Adding `wait=0` makes each poll fire-and-return immediately.
  - **In-flight guard** — Added `isPollingInFlight` flag; if a `pollTimeline()` call is still awaiting a response, subsequent worker ticks skip instead of launching another concurrent fetch.
  - **10-second stale watchdog** — `renderTick()` (200ms interval) now tracks `lastSuccessfulPoll`. If no successful poll has completed in 10 seconds, the entire poll cycle is automatically restarted — silent self-healing without user intervention.
  - **`visibilitychange` listener** — Added to `plugin.html` to fire an immediate `pollTimeline()` when Stream Deck is restored from the system tray, covering the gap where CEF throttles network activity for hidden pages.
- **Connection settings overwritten by stale per-action values** — Connection settings (`plexServerUrl`, `plexToken`, `playerUrl`, `clientName`) were being propagated from each button's per-action settings into global state on every `willAppear` event — the same class of bug fixed for display preferences in v2.0.4. With multiple buttons on the deck, whichever fired last won: a button with `localhost:32500` saved from a previous config could silently replace a correctly configured remote server address, causing HTTP 401 errors on all server metadata calls until Stream Deck was restarted. `applySettingsToGlobal` no longer propagates any settings; `didReceiveGlobalSettings` is now the sole authoritative source for all connection and display configuration.

---

## [2.0.4] - 2026-03-01

### 🐛 Bug Fixes
- **Dynamic colors re-enable on song change** — Display preferences (`dynamicColors`, `textColor`, `debugMode`, `syncOffset`) were being propagated from each action's per-action settings into global state on every `willAppear` event. With multiple actions on the deck, whichever action fired last would silently overwrite the correct global value — so unchecking "Dynamic accent colors" would get reset back to enabled when the next track (and therefore `willAppear`) fired. Fixed by making `didReceiveGlobalSettings` the sole authoritative source for display preferences; per-action propagation now only applies connection settings (`plexServerUrl`, `plexToken`, `playerUrl`, `clientName`).
- **Plugin goes stale after OS sleep or Stream Deck tray minimize** — Added a `systemDidWakeUp` handler (the correct Stream Deck SDK event for OS sleep/wake and tray restore). Web Worker timers are throttled by CEF while the window is hidden; on wake the poll cycle is now fully restarted so the plugin immediately resumes tracking playback.

---

## [2.0.3] - 2026-03-01

### 🐛 Bug Fixes
- **Buttons go stale after Stream Deck minimize to tray** — On reconnect, `ConnectionManager` creates a fresh WebSocket but the plugin was holding a reference to the original closed socket in `state.websocket`. All `setImage`/`setFeedback` calls silently dropped after any reconnect, freezing album art, track info, and all button renders on whatever was last displayed. Fixed by storing the `ConnectionManager` instance in `state.connection` instead of the raw socket, so all render paths always route through the live socket regardless of how many reconnects have occurred.

---

## [2.0.2] - 2026-02-21

### ✨ New Features
- **Volume Up & Volume Down buttons** — Two new dedicated key actions
  - Canvas-drawn speaker icon (body + two wave arcs + `+`/`−` badge) — no static image, fully rendered like the Next/Previous buttons
  - Icon fills from the bottom with the dynamic album art accent color proportional to current volume
  - At 0% the entire icon is dark gray; at 100% the entire icon (including the badge) is filled with accent color
  - **Long-press mute on Volume Down** — hold for 400ms to mute Plexamp instantly; press hold again to restore to the previous volume level
  - Quick tap still adjusts volume by ±5% as expected

### 🐛 Bug Fixes
- **Volume reset to 50% at 0%** — `timelineData.volume || 50` falsily treated `0` as missing; changed to nullish coalescing (`?? 50`) so 0% is respected
- **Volume race condition** — rapid presses or timeline polls could overwrite a pending volume command with a stale server value; fixed with a 2-second post-command guard and immediate optimistic state update with revert-on-failure
- **Rapid press phantom mute** — the long-press mute timer could fire against a later rapid press's hold state; fixed by capturing a reference identity at schedule time and rejecting the timeout if the hold state belongs to a different press
- **Mute restore state leak** — `muteRestoreVolume` was not cleared on manual tap adjustments; both Volume Up and Volume Down taps now clear it so manual control always takes full ownership

---

## [2.0.1] - 2026-02-20

### ✨ New Features
- **Time display toggle** - Time Elapsed button now toggles between `elapsed / total` and `elapsed / -remaining` display modes, just like Plexamp
  - Click/tap the Time Elapsed button to switch modes
  - Shows `2:26 / 5:00` by default (elapsed / total)
  - Shows `2:26 / -2:34` when toggled (elapsed / -remaining)
  - State persists per button instance

### 🐛 Bug Fixes
- **Rating preservation on track skip** - Fixed issue where rating a track and immediately skipping to the next track would lose or misapply the rating
  - Rating `ratingKey` now captured at button-press time, not when debounce fires
  - Plex server always receives the correct rating for the intended track
  - Stream Deck display no longer shows incorrect rating when debounce fires after a skip
- **ESLint warnings** - Removed unused error variable in seek handler
- **ESLint errors** - Added `AbortController` to global definitions

## [2.0.0] - 2026-02-18

### 🏗️ Major Architecture Overhaul
- **Complete modular rewrite** - Reorganized from single 1934-line file into 12 specialized ES6 modules
- **Professional code structure** - Clean separation of concerns (core, plex, ui, utils)
- **Modern build system** - Rollup bundler with ES6+ features and tree-shaking
- **Zero ESLint warnings** - Production-quality code passing all linting checks

### 🎬 New Visual Features
- **Animated seek buttons** - Previous/Next buttons feature smooth directional animation during hold-to-seek
  - Arrows move in the direction they face (Previous left, Next right)
  - Pac-Man style wrapping: arrows seamlessly travel through tile edges
  - 30 pixels per frame travel speed at 500ms intervals
  - Tight wrap rendering shows arrows entering opposite edge while exiting
- **Canvas-rendered navigation** - Next/Previous buttons dynamically rendered with accent colors from album art
- **Configurable icon sizes** - Four size presets for navigation buttons (24px, 32px, 40px, 48px)
- **Paused state dimming** - All buttons automatically turn gray when playback paused:
  - Album art shows gray overlay
  - Navigation buttons render in dark gray
  - All action tiles provide clear visual feedback
- **Symmetrical spacing** - Professional equal gaps throughout:
  - Touch strip elements
  - Track Info tile
  - Time Elapsed tile
  - Overlay text (title and content)
- **Enlarged text** - Dramatically improved readability:
  - Time Elapsed: 42px elapsed / 40px total
  - Track Info: 36px title / 26px subtitle / 24px tertiary / 42px main content
  - Overlays: 24px title / 44px content

### ✨ Enhanced Functionality
- **Improved rating system** - Rating button now supports:
  - Half-star increments (0.5) or full-star increments (1.0)
  - Wrap-around: tapping at 5 stars cycles back to 0
  - 2-second debounce for smooth server communication
- **Touch strip tap-to-pause** - Tap anywhere on the strip to play/pause (v1.0 feature restored)
- **Album art interaction** - Tap album art tile to play/pause with gray overlay feedback
- **Hold-to-seek improvements** - Local position tracking prevents API staleness during continuous seeking
  - Tracks targetPosition locally
  - Accumulates seeks independently of API state
  - Seamless navigation through long tracks
- **Automatic reconnection** - WebSocket auto-reconnect with exponential backoff (3s → 30s max)
- **Input validation** - Comprehensive validation for all user settings (URLs, tokens, colors)
- **Centralized state management** - StateManager class replacing scattered globals
- **Enhanced error handling** - Graceful fallbacks and detailed logging throughout
- **Debug logging system** - In-memory log buffer with browser console access

### 🐛 Bug Fixes
- **Rating bug fixed** - Changed `>=` to `===` comparison for proper rating cache handling
- **Hold-to-seek fixed** - Continuous seeking now works indefinitely, even when Stream Deck is minimized to tray
  - Rewrote seek logic to use sequential/recursive approach instead of parallel intervals
  - Each seek waits for the previous one to complete before starting the next
  - Added 1-second AbortController timeout to prevent hanging connections
  - Animation synchronized with seek timing for intuitive feedback (faster seeks = faster animation)
  - Completely eliminates browser connection pool exhaustion
- **Touch strip restored** - Tap-anywhere functionality from v1.0 properly restored

### 🛠️ Developer Experience
- **Modular imports** - Clear dependency graph and code organization
- **Build scripts** - `npm run build`, `npm run dev`, `npm run pack`
- **Hot reload** - Watch mode for development (`npm run dev`)
- **Updated ESLint config** - ES module support with modern syntax (ES2020)
- **Comprehensive README** - Architecture documentation and contribution guidelines

### 📦 Technical Details
- **12 modules** across 4 directories (core, plex, ui, utils)
- **Plugin size** - 100.3 KiB bundled
- **Clean codebase** - No unused variables, proper async/await, modern patterns
- **Animation system** - Frame-based tracking at 500ms intervals synchronized with seek operations

### 🎯 Architecture Modules
- `core/connectionManager.js` - WebSocket with auto-reconnect
- `core/stateManager.js` - Centralized state container with button hold tracking
- `core/constants.js` - Application-wide constants
- `plex/plexConnection.js` - Plex API communication
- `plex/playbackController.js` - Playback commands with debouncing
- `plex/metadataCache.js` - Metadata & rating cache management
- `ui/buttonRenderer.js` - Canvas rendering for buttons with animation support
- `ui/layoutManager.js` - Touch strip layouts, scrolling text, symmetrical spacing
- `utils/validator.js` - Input validation functions
- `utils/logger.js` - Logging system with levels
- `utils/helpers.js` - Utility functions

### ⚠️ Breaking Changes
None - v2.0 is fully backward compatible with v1.0 settings

---

## [1.0.0] - 2026-02-17

### Added
- Initial release of Ampdeck+
- Based on Ampdeck v1.3.1
- Stability improvements
- Performance optimizations
- UI polish and refinements

### Changed
- Project rebranded to Ampdeck+

### Notes
Ampdeck+ is a fork of Ampdeck and continues development with active maintenance.
