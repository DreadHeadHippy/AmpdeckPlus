<h1 align="center">Ampdeck+</h1>

<p align="center">
  <strong>The <em><strong>unofficial</strong></em> Plexamp plugin for Stream Deck</strong><br>
</p>

Ampdeck+ brings Plexamp to your Stream Deck. See your album art, track info, playback time, and rate your tracks on the LCD keys. All updated in real time. Stream Deck+ users get the full experience with a smooth animated progress bar spanning the touch strip and configurable dial controls.

<p align="center">
  <a href="https://marketplace.elgato.com/product/ampdeck-52a986e0-7da0-4e09-ba16-84858fcb5524">
     <strong>Available Now on the Elgato Marketplace</strong>
  </a>
</p>

<p align="center">

<https://github.com/user-attachments/assets/1c15f9e5-a5f7-44d7-b85b-021a6399c92b>

</p>

---

![Release](https://img.shields.io/github/v/release/DreadHeadHippy/AmpdeckPlus)
![Status](https://img.shields.io/badge/status-actively%20maintained-brightgreen)
![Downloads](https://img.shields.io/github/downloads/DreadHeadHippy/AmpdeckPlus/total)
![Last Commit](https://img.shields.io/github/last-commit/DreadHeadHippy/AmpdeckPlus)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/dreadheadhippy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ What's New in v2.0.15

- **Queue (Up Next) browser** — See your next 3 upcoming tracks on the touch strip. Rotate the dial to scroll, press to remove a track from the queue.
- **Toggle Queue / Playlist with touch** — Tap the strip to flip between the playlist carousel and the queue view and back again.
- **Star ratings in queue rows** — Each queue row shows the track's star rating in the accent color. Configurable format: half stars, full stars, single-star toggle, or none.
- **Logarithmic fade curve** — The Volume Down hold-to-mute fade now sounds natural rather than mechanical, dropping quickly at first and easing toward silence.
- **Progress bar consistent across all strip modes** — The playlist carousel now matches the queue and text strip exactly (y=95, 5px).

📋 **[View Full Changelog](CHANGELOG.md)**

---

## Features

- **Album Art** — Live album art on any LCD key with a pause overlay. Tap to play/pause. When playback is paused, the album art displays with a gray overlay.
- **Playlist Button** — Dedicated key action to assign playlists. Assign playlists to buttons, allowing you to start your playlists with the press of a button. Enable **Start playlist shuffled** to shuffle on play.
- **Playlist Carousel** — Touch strip action that displays your Plex playlists in a scrollable view. Choose between poster art mode (3-up artwork browser) or text mode. Rotate the dial to browse, press to queue and play the selected playlist. Enable **Start playlist shuffled** to shuffle on play. Load your playlists from the action settings.
- **Queue (Up Next) browser** — Touch strip mode that shows the next 3 upcoming tracks as a live scrollable list with title, artist, and star rating. Rotate the dial to move the cursor, press to remove the focused track from the queue. The first item (pre-buffered by Plexamp) is shown with a lock icon and cannot be removed. Enable **Toggle Queue / Playlist with touch** in the Playlist Carousel settings to tap between the carousel and queue views without leaving the strip.
- **Now Playing Strip** — Artist, album, track, or elapsed time on each touch strip panel with auto-scrolling for long text. Clean symmetrical spacing and enlarged text for better readability.
- **Dial Controls** — Configurable dial actions: rotate to skip tracks, adjust volume, or rate tracks. Press to play/pause, toggle shuffle, or cycle repeat.
- **Star Ratings** — Rate your tracks with half-star or full-star increments using the dial or dedicated rating button. Visual feedback shows the rating with stars. Ratings intelligently debounced for smooth server communication.
- **Rating Button** — Dedicated button showing the current track's star rating. Tap to cycle through ratings with configurable font size and increment mode (full star, half star, or single-star). In **single-star mode**, tapping cycles through all three Plexamp states: unrated (☆) → liked (★) → disliked (★ with diagonal strikethrough) → unrated. Wraps from 5 stars back to 0 for quick clearing in multi-star modes.
- **Touch Strip Controls** — Tap anywhere on the strip to play/pause with visual feedback overlays showing the action taken. Symmetrical spacing throughout.
- **Spanning Progress Bar** — A single progress bar that flows across all 4 dials, with colors extracted from album art.
- **Volume Up / Down** — Dedicated buttons with a canvas-drawn speaker icon. The icon fills with the album art accent color from the bottom proportional to current volume. Hold **Volume Down** for 400ms to mute and pause; hold again to restore volume and resume. Enable **"Fade Out on hold-to-mute"** in the button settings for a gradual fade instead of an instant cut — ideal for streaming. Configure the fade duration from 1–30 seconds (default: 3s).
- **Play / Pause** — Dedicated button with instant visual feedback.
- **Previous / Next** — Tap to skip tracks. Hold for 400ms to activate seek mode with **animated directional arrows** that smoothly travel across the button and wrap around Pac-Man style. Previous arrows move left, Next arrows move right. Configurable icon size (40-72px) with four preset options.
- **Paused State Visual Feedback** — When playback is paused, all buttons turn gray automatically: Album Art overlay, Navigation buttons, and all other action tiles provide clear visual indication.
- **Shuffle** — Toggle shuffle on/off with visual state indicator.
- **Repeat** — Cycle through repeat modes: Off → All → One.
- **Track Info** — Audio codec, bitrate, and track number at a glance with enlarged, easy-to-read text and symmetrical spacing. Intelligently distinguishes between album and playlist queues: when playing an album (shuffled or not) it shows the track's real position on the album (e.g. `7/14`), matching what Plexamp displays; when playing a playlist it shows the track's position within the full playlist (e.g. `342/8837`). Font auto-shrinks on large playlists so numbers always fit.
- **Track Title** — Dedicated button that displays the current track title in large auto-sized text. Supports up to 3 lines of word-wrapped text, scaling the font automatically to best fill the available space. Dims to gray when Plexamp is disconnected.
- **Next Album / Previous Album** — Skip forward or back to the first track of the next or previous album in the current playlist queue. Ideal for playlist listeners who want to jump whole albums at a time. Configurable icon size matching the Next/Previous buttons. Silently no-ops when not playing from a playlist queue.
- **Time Elapsed** — Large elapsed/total time display (42px/40px fonts) with its own progress bar and symmetrical spacing. **Tap to toggle** between `elapsed / total` and `elapsed / -remaining` display modes, just like Plexamp.
- **Dynamic Colors** — Progress bar and accent colors adapt to the current album art, or lock to orange if you prefer. Canvas-rendered navigation buttons use dynamic accent colors when active.
- **Configurable Text Colors** — Choose from White, Light Gray, Orange, Amber, or Black to match your setup.
- **Direct Player Communication** — Commands go straight to Plexamp's local API for fast, reliable playback control with automatic server fallback.
- **Hold-to-Seek with Local Position Tracking** — Continuous seeking without API staleness. The plugin tracks position locally and accumulates seeks independently for seamless navigation through long tracks.

## Screenshots

### Available Actions

<p align="center">
  <img src="assets/key-actions.png" alt="Ampdeck+ Key Actions" width="300">
  <br>
  <em>Key Actions: Album Art, Play/Pause, Previous, Next, Shuffle, Repeat, Rating, Track Info, Time Elapsed</em>
</p>

<p align="center">
  <img src="assets/dial-actions.png" alt="Ampdeck+ Dial Actions" width="300">
  <br>
  <em>Dial Actions: Now Playing Strip with configurable display modes and dial controls</em>
</p>

## Compatibility

Ampdeck+ works on **any Stream Deck model** — the button actions (Album Art, Play/Pause, Previous, Next, Shuffle, Repeat, Track Info, Time Elapsed) work on every device with LCD keys. The Now Playing Strip with dials and progress bar is exclusive to the **Stream Deck+**.

| Feature | Stream Deck / XL / MK.2 / Mini / Neo | Stream Deck+ |
|---------|:-------------------------------------:|:------------:|
| Album Art | ✓ | ✓ |
| Play / Pause | ✓ | ✓ |
| Previous / Next | ✓ | ✓ |
| Shuffle | ✓ | ✓ |
| Repeat | ✓ | ✓ |
| Track Info | ✓ | ✓ |
| Time Elapsed | ✓ | ✓ |
| Rating | ✓ | ✓ |
| Track Title | ✓ | ✓ |
| Next Album | ✓ | ✓ |
| Previous Album | ✓ | ✓ |
| Volume Up | ✓ | ✓ |
| Volume Down | ✓ | ✓ |
| Now Playing Strip | — | ✓ |
| Queue (Up Next) Browser | — | ✓ |
| Dial Controls | — | ✓ |
| Spanning Progress Bar | — | ✓ |

## Requirements

- Any [Stream Deck](https://www.elgato.com/stream-deck) model (Stream Deck+ recommended for the full experience)
- [Plexamp](https://www.plex.tv/plexamp/) running on the same network or remotely
- Access to a [Plex Media Server](https://www.plex.tv/media-server-downloads/) with a music library (you don't need to own the server)

## Installation

> **⚠️ Important:** If you have **Ampdeck** installed, please **uninstall it first** before installing **Ampdeck+**.

1. Close Stream Deck completely (right-click system tray icon → Quit)
2. Download **`com.dreadheadhippy.ampdeckplus.streamDeckPlugin`** from the [Releases](https://github.com/DreadHeadHippy/AmpdeckPlus/releases) page
3. Double-click the file to install

That's it. Stream Deck handles the rest.

## Updating

**Windows:**

1. Close Stream Deck completely (right-click system tray icon → Quit)
2. Download `install.bat` from the latest [Releases](https://github.com/DreadHeadHippy/AmpdeckPlus/releases)
3. Double-click `install.bat`

**macOS:**

1. Close Stream Deck completely (menu bar icon → Quit)
2. Download `install.sh` from the latest [Releases](https://github.com/DreadHeadHippy/AmpdeckPlus/releases)
3. Run `chmod +x install.sh && ./install.sh`

The install scripts will update the plugin while preserving your settings.

## Setup

1. Find **Ampdeck+** in the actions list on the right side of the Stream Deck app

   <img src="assets/plugin-menu.png" alt="Ampdeck+ in plugins list" width="250">

2. Expand to see all available actions:

   <img src="assets/actions-list.png" alt="Ampdeck+ actions" width="250">

3. Drag **Album Art** to any button
4. Drag **Now Playing Strip** to all 4 dials
5. Optionally drag **Play/Pause**, **Previous**, **Next**, **Next Album**, **Previous Album**, **Volume Up**, **Volume Down**, **Shuffle**, **Repeat**, **Track Info**, **Track Title**, **Time Elapsed**, or **Rating** to buttons
6. Click any Ampdeck+ action and configure:

### Plex Setup

#### 1-Click Setup (Recommended)

Ampdeck+ features automatic Plex authentication and discovery:

1. Drag any Ampdeck+ action to a button slot in the Stream Deck app
2. Click the button slot to open the Property Inspector (config panel)
3. Click **Sign in with Plex**
4. Authorize Ampdeck+ in the browser window that opens
5. That's it! Your Plex server and Plexamp player are now configured automatically

The setup process:
- Uses Plex's official PIN-based authentication (no passwords needed)
- Automatically discovers your Plex server from your account
- Auto-detects your local Plexamp player
- Securely stores your auth token

#### Manual Setup (Advanced)

If you prefer manual configuration or need to override auto-discovered settings, expand **Advanced Settings** in the Property Inspector:

| Setting | Description |
|---------|-------------|
| **Player URL** | Override auto-discovered Plexamp player address. Default: `http://localhost:32500` for headless Plexamp. Desktop users may need a different port — check Plexamp's settings. |
| **Server URL** | Override auto-discovered Plex server address (e.g. `http://192.168.1.100:32400`) |
| **Plex Token** | Override token from Plex sign-in. See [Finding Your Plex Token](#finding-your-plex-token) if needed. |
| **Client Name** | Your computer's name as it appears in the Plex dashboard (used for server fallback) |

Use the **Test Player** button to verify the Plexamp connection and **Test Server** to verify the Plex server connection.

### Strip Configuration

Each dial panel can be configured independently:

| Setting | Options |
|---------|---------|
| **Display Mode** | Artist, Album, Track Title, Time, or Playlists |
| **Font Size** | Small (12) through XX-Large (28) |
| **Dial Action** | None, Next/Previous (rotate), Volume (rotate), or Star Rating (rotate) |
| **Rating Mode** | Half Star (0.5 increment) or Full Star (1.0 increment) — only appears when Dial Action is set to Star Rating |
| **Dial Press** | Play/Pause, Toggle Shuffle, or Cycle Repeat |
| **Total Panels** | How many panels share the progress bar (1–4) |
| **Panel Position** | This panel's position in the progress bar sequence, or None to disable |
| **Text Color** | White, Light Gray, Orange, Amber, or Black |
| **Dynamic Colors** | When enabled, accent colors are extracted from album art. When disabled, they stay orange. |
| **Start playlist shuffled** | Only visible when Display Mode is set to Playlists. When checked, pressing to play a playlist will shuffle it. |

For example, to have the progress bar span all 4 dials: set each panel to "4 panels" and positions 1, 2, 3, 4 from left to right.

### Advanced Settings

| Setting | Description |
|---------|-------------|
| **Time Offset** | Compensates for network latency between the player and the display. Defaults to 0ms. Only needed if the time display feels ahead or behind. |
| **Debug Logging** | When enabled, logs detailed API requests and connection state to the browser console. Plex tokens are automatically sanitized in log output for safe sharing. |

## Finding Your Plex Token

> **Note:** The 1-click setup handles authentication automatically. You only need this if using manual configuration.

1. Open Plex Web (app.plex.tv) in your browser
2. Play any media
3. Press **F12** to open developer tools
4. Go to the **Network** tab
5. Look for any request and find `X-Plex-Token` in the URL
6. Copy the token value

For more details, see the [Plex support article](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not showing in actions list | Make sure Stream Deck was fully closed before running `install.bat` or `install.sh` |
| Player test fails | Verify Plexamp is running and the Player URL is correct. Headless Plexamp defaults to port 32500. Desktop Plexamp may use a different port. |
| Server test fails | Verify your server URL includes the port (`:32400`) and your token is correct |
| Buttons not working | This is usually a connection issue. Enable debug logging and check the browser console (`http://localhost:23654`) for errors. |
| Nothing displays | Confirm Plexamp is actively playing. Check both Player and Server test buttons. |
| Time display is off | Adjust the Time Offset in Advanced settings (try small values like 500–1000) |
| Progress bar not aligned | Check that all strip panels have matching Total Panels values |

### Debug Logging

If something isn't working, enable **Debug Logging** in the Advanced section of any Ampdeck+ action's settings. Then open the Stream Deck remote debugger at `http://localhost:23654` in your browser to see detailed logs. Plex tokens are automatically masked in log output, so it's safe to share logs when reporting issues.

## Manual Installation

Copy the `com.dreadheadhippy.ampdeckplus.sdPlugin` folder to:

**Windows:**

```
%APPDATA%\Elgato\StreamDeck\Plugins\
```

**macOS:**

```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/
```

Then restart Stream Deck.

---

## 🛠️ Development & Architecture

### Project Structure
```
src/
├── plugin.js              # Main entry point & event orchestration
├── core/
│   ├── constants.js       # Application constants
│   ├── connectionManager.js # WebSocket with auto-reconnect
│   └── stateManager.js    # Centralized state container
├── plex/
│   ├── plexConnection.js  # Plex API communication
│   ├── playbackController.js # Playback commands
│   └── metadataCache.js   # Metadata & rating cache
├── ui/
│   ├── buttonRenderer.js  # Canvas button rendering
│   └── layoutManager.js   # Touch strip layouts
└── utils/
    ├── validator.js       # Input validation
    ├── logger.js          # Logging system
    └── helpers.js         # Utility functions
```

### Build Commands
```bash
# Install dependencies
npm install

# Build plugin (compile modules → single file)
npm run build

# Build + watch for changes
npm run dev

# Lint source code
npm run lint

# Build + package for distribution
npm run pack
```

### Technology Stack
- **ES6+ Modules** - Modern JavaScript with import/export
- **Rollup** - Module bundler for production build
- **ESLint 10** - Flat config format, zero warnings
- **Stream Deck SDK v2** - Latest SDK features
- **Web Workers** - Non-blocking polling and rendering

### Architecture Highlights

#### v2.0 Improvements Over v1.0
| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Structure | Single 1934-line file | 12 modular files |
| State Management | 30+ global variables | Centralized StateManager |
| Error Handling | Basic try/catch | Comprehensive with fallbacks |
| Reconnection | None (dead on disconnect) | Automatic with backoff |
| Input Validation | None | Comprehensive validator module |
| Code Quality | Functional | Zero ESLint warnings |
| Maintainability | Difficult | Excellent |

#### Key Features

**Automatic Reconnection**
If the WebSocket connection to Stream Deck drops unexpectedly, the plugin automatically attempts to reconnect with exponential backoff (this only happens when disconnected - normal operation is unaffected):
- 1st attempt: 3 seconds
- 2nd attempt: 6 seconds
- 3rd attempt: 12 seconds
- Max delay: 30 seconds

Note: This is separate from the regular polling (1 second for playback data, 200ms for display updates) which runs continuously while connected.

**Hold-to-Seek**
Press and hold the Previous or Next buttons for 400ms to switch from track skipping to seeking. The plugin will seek 10 seconds per step while you hold the button.

**Rating Cache**
The plugin intelligently caches your rating changes to handle Plex server metadata delays. If you rapidly adjust ratings, the UI stays responsive while the server catches up.

**Dynamic Color Extraction**
Album art is analyzed to extract the dominant color, which is then used as an accent color throughout the UI (unless disabled in settings).

## Contributing

Contributions are welcome! Please see the [Contributing Guidelines](https://github.com/DreadHeadHippy/AmpdeckPlus?tab=contributing-ov-file) for detailed information on how to contribute to this project.

---

## Contributors

- [@rackemrack](https://github.com/rackemrack) - Original Ampdeck creator
- [@DreadHeadHippy](https://github.com/DreadHeadHippy) - v2.0 rewrite, modularization, and ongoing development

## Support

If Ampdeck+ is useful to you, consider [buying me a coffee](https://ko-fi.com/dreadheadhippy). Donations are always appreciated, but never required.

## License

[MIT](LICENSE)
