# Changelog

## [Unreleased]

### ✨ New Features
- **Queue (Up Next) browser on touch strip** — New `Queue (Up Next)` display mode for the Stream Deck+ touch strip tile. Shows the next 3 upcoming tracks as a scrollable text list with title and artist. Rotate the dial to scroll the cursor, press the dial to remove the focused track from the queue. The very next track (index 0) is un-kickable (Plexamp pre-buffers it) and is visually marked with a ▶ prefix and a muted highlight to make this clear.
- **Toggle Queue / Playlist with touch** — When the strip tile is set to "Playlists (Carousel)", a new **"Toggle Queue / Playlist with touch"** checkbox appears in the Property Inspector. When enabled, tapping the touch strip switches the tile between the playlist carousel and the Up Next queue view. Tap again to switch back. The dial continues to work correctly in whichever view is active.

### 🎨 Visual Polish
- **Progress bar pinned to the bottom edge on all strip modes** — The progress bar is now fixed at y=96 (4px from the bottom) across Artist, Album, Track Title, Time, Playlist (text), and Playlist (3-Up Poster) modes, matching the Queue layout. Content (label + text) re-centres in the space above using three equal gaps.

---

## [2.0.14] - 2026-03-24

### ⚡ Performance
- **Near-instant album art and accent color after track skip** — Album art, accent color, and queue/track-count data now load in parallel instead of sequentially. Previously, fetching the track count, play queue position, and album art were chained one after another, adding 400–1000ms of unnecessary wait time. All three now fire simultaneously and finish in the time of the slowest request alone.
- **Reduced skip detection latency** — After pressing Next or Previous (button or dial), two timeline polls are now scheduled (at 300ms and 700ms) instead of one. The second poll acts as a fallback for cases where Plexamp takes slightly longer to register the track change, preventing the detection from falling all the way back to the regular 1-second poll interval.
- **Smaller album art downloads** — Album art is now requested via Plex's photo transcoder at the button's native resolution (144×144px) rather than downloading the full-size image. Plex resizes server-side so only the pixels that are actually used are transferred, reducing image download size by up to 95%.

---

## [2.0.13] - 2026-03-23

### ✨ New Features
- **"Show TITLE Label" toggle on Track Title button** — The Track Title button's Property Inspector now has a **"Show 'TITLE' Label"** checkbox. When unchecked, the "TITLE" header is hidden and the track title expands to use the full button space, centred evenly. The checkbox is checked by default, preserving the existing layout for existing users.

---

## [2.0.12] - 2026-03-18

### ✨ New Features
- **Fade Out on hold-to-mute** — The Volume Down button now has an optional **"Fade Out on hold-to-mute"** setting (in the button's Property Inspector). When enabled, holding the button for 400ms gradually fades the volume  to 0 over ~3 seconds instead of cutting instantly, then pauses playback. Holding again restores the original volume and resumes playback. With the setting off, hold-to-mute now also pauses playback on mute and resumes on unmute (matching the fade behaviour).
- **Configurable fade duration** — When "Fade Out on hold-to-mute" is enabled, a **Fade Duration** field appears in the Volume Down button settings. Set the fade length anywhere from 1 to 30 seconds (default: 3s).
- **Track Title button** — New button action that displays the current track title in large, auto-sized text. Supports up to 3 lines of word-wrapped text and scales the font automatically to fill the available space. Shows "No Track" when Plexamp is disconnected.
- **Next Album button** — Skips forward to the first track of the next album in the current playlist queue. Ideal for playlist listeners who want to jump whole albums at a time. Supports configurable icon size. Works only when playing from a playlist queue — silently no-ops otherwise.
- **Previous Album button** — Skips back to the first track of the previous album in the current playlist queue. Mirrors Next Album in behaviour and settings.

### 🎨 Visual Polish
- **Previous / Next sidebar icons updated** — The action picker icons for Previous and Next now match the actual canvas-drawn double-triangle icons rendered on the buttons at runtime.

### 🐛 Bug Fixes
- **Volume button accent fill resets during mute** — While muted or fading, the timeline poll would periodically overwrite `currentVolume` with the pre-mute level reported by Plexamp, causing the volume button to visually refill as if the volume had never changed. The timeline volume update is now suppressed while a mute or fade is active.
- **Track Info shows correct track number in all queue scenarios** — Track number display is now driven by the actual queue type rather than heuristics:
  - **Album queue (shuffled or not):** shows the track's real position on the album (e.g. `7/14`), matching what Plexamp displays.
  - **Playlist queue (shuffled or not):** shows the track's position within the full playlist (e.g. `342/8837`).
  - Queue type is determined by inspecting `parentRatingKey` diversity across all tracks in the full queue response, which is reliable regardless of shuffle state, skip history, or reshuffle operations.
- **Hold-to-mute short-press while muted no longer corrupts volume restore target** — Short-pressing Volume Down while the player was muted (via hold) was incorrectly passing through to `handleButtonAction`, which cleared `muteRestoreVolume` and caused volume to restore to the fallback 50% instead of the original level. The short press is now a no-op while muted.

---

## [2.0.11] - 2026-03-18

### ✨ New Features
- **Track Info shows playlist position** — When playing a playlist, the Track Info button now shows the track's position within the playlist queue (e.g. `3/24`) instead of its position in the source album (e.g. `4/16`). When playing an album directly, album position is shown as before. The label always reads `TRACK` regardless.

### 🐛 Bug Fixes
- **Single-star rating now matches Plexamp's 3-state behaviour** — The Rating button in single-star mode previously toggled between unrated and the "disliked" state (rating 2), meaning every rated track appeared with the crossed-out star in Plexamp. The button now cycles through all three states in the correct order: unrated (empty ☆) → liked (filled ★, rating 10) → disliked (filled ★ with diagonal strikethrough, rating 2) → unrated.
- **Track number no longer overflows the button on large playlists** — The track number font auto-shrinks from 42px down to 16px to ensure values like `1234/10000` always fit within the button width without clipping.

### 🎨 Visual Polish
- **Diagonal strikethrough on disliked single-star state** — The disliked state on the Rating button now draws a diagonal "/" line across the star in the accent color, clearly distinguishing it from the liked state at a glance.

---

## [2.0.10] - 2026-03-14

### ✨ New Features
- **"Use Local Plexamp Instance" checkbox** — A new checkbox in the Property Inspector (above the player URL field) lets you instantly lock the player address to `http://localhost:32500`. When checked, the URL field is overridden and locked, ensuring Ampdeck+ always connects to the local Plexamp desktop app rather than accidentally binding to a phone or remote player. Unchecking restores your previously saved custom URL.
- **Single-star rating mode** — New rating option on the Rating button that toggles between rated (1 star) and unrated with a single tap.

### 🐛 Bug Fixes
- **"Use Local Plexamp Instance" checkbox stuck on localhost when unchecked** — When the checkbox was checked, `saveSettings()` was persisting `http://localhost:32500` as the saved player URL, so reopening the Property Inspector had no original URL to restore to. The real URL is now saved from `dataset.savedUrl` while the override is active.
- **Text color not applying on first render** — `renderStripLayout` was reading `settings.textColor` from stale per-action `willAppear` data before falling back to the global `getTextColor()`. This caused the strip to render with a leftover per-action color until the next full render cycle. The renderer now always calls `getTextColor()` directly, sourcing the color exclusively from global settings.
- **Colors not refreshed after global settings arrive** — `onDidReceiveGlobalSettings` now calls `updateAllDisplays()` immediately after starting the poll workers, so the correct `textColor` and `dynamicColors` are applied the moment global settings land rather than waiting for the next render tick. Prevents a brief flash of stale colors on session start.
- **Text color picker showing wrong color in Property Inspector** — The `textColor` input was falling back to `#E5A00D` (amber) regardless of the user's saved preference, causing the color picker to display amber instead of the user's chosen color when reopening the Property Inspector. The fallback is now `#FFFFFF` (white) and only applies on a genuine fresh install with no saved settings.

---

## [2.0.9] - 2026-03-12

### 🔒 Security
- **XSS fix in Property Inspector** — All user-controlled and API-sourced values (`username`, `serverName`, `serverUrl`, `playerUrl`, `server.name`, connection URIs, `error.message`) are now HTML-escaped before being written to `innerHTML` in `pi.html`. Previously, a malicious Plex server or crafted API response could inject arbitrary HTML/script content into the Stream Deck Property Inspector UI (CWE-79 / CodeQL `js/xss`). Fixed by introducing an `escapeHtml()` utility and applying it at every tainted `innerHTML` sink.

---

## [2.0.8] - 2026-03-10

### ✨ New Features
- **1-Click Plex Authorization** — Sign in with Plex using the official PIN-based OAuth flow. Click **Sign in with Plex** in the Property Inspector, authorize in your browser, and Ampdeck+ automatically discovers your Plex server and Plexamp player from your Plex account — no manual token hunting, IP addresses, or port configuration required. Supports both owned and shared Plex servers. Manual configuration remains available in Advanced Settings for power users.

---

## [2.0.7] - 2026-03-06

### ✨ New Features
- **Canvas-drawn play/pause button** — The play/pause button now renders its play triangle and pause bars directly on the canvas like all other buttons — no static icon. Icon size is configurable (Small 40px → Extra Large 72px) via button settings.
- **Shuffle & Repeat button redesign** — Icons now fill with the dynamic accent color when enabled; labels (`ON`/`OFF`, `ALL`/`ONE`/`OFF`) are always visible in white so state is always readable at a glance. New **"Keep accent color when off"** option per-button keeps the icon accent-colored even in the off state.
- **Navigation icon size options expanded** — Default bumped to 60px (matching the play/pause icon height) and Extra Large 72px option added.
- **Start playlist shuffled** — The Playlist Carousel and playlist buttons now have a **"Start playlist shuffled"** checkbox. When checked, pressing to play will start a playlist shuffled automatically.

### 🎨 Visual Polish
- **Paused state no longer dims buttons or the touch strip** — `isDimmed` now only triggers on `stopped` (Plexamp disconnected/not running). All buttons, the Now Playing strip, and the playlist carousel display in full color when playback is paused, matching the full-control behavior that was already in place for the playing state.

---

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
