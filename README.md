# Ampdeck

**The unofficial Plexamp plugin for Stream Deck+**

<!-- Replace the line below with your render once it's ready -->
<!-- ![Ampdeck on Stream Deck+](screenshots/hero.png) -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/rackemrack)

---

Ampdeck brings Plexamp to your Stream Deck+. See your album art, track info, and playback time on the LCD keys, with a smooth animated progress bar spanning the touch strip — all updated in real time.

## Features

- **Album Art** — Live album art on any LCD key with a pause overlay. Tap to play/pause.
- **Now Playing Strip** — Artist, album, track, or elapsed time on each touch strip panel.
- **Spanning Progress Bar** — A single progress bar that flows across all 4 dials, with colors extracted from album art.
- **Play / Pause** — Dedicated button with instant visual feedback.
- **Previous / Next** — Tap to skip tracks. Hold to seek forward or backward.
- **Track Info** — Audio codec, bitrate, and track number at a glance.
- **Time Elapsed** — Large elapsed/total time display with its own progress bar.
- **Dynamic Colors** — Progress bar and accent colors adapt to the current album art.
- **Smooth Interpolation** — Time display updates at 200ms with configurable sync offset to stay in sync with Plexamp.

## Requirements

- [Stream Deck+](https://www.elgato.com/stream-deck-plus) (requires the touch strip and dials)
- [Plexamp](https://www.plex.tv/plexamp/) running on the same network
- A [Plex Media Server](https://www.plex.tv/media-server-downloads/) with your music library

## Installation

1. Download the latest release from the [Releases](https://github.com/rackemrack/ampdeck/releases) page
2. Extract the zip
3. **Close Stream Deck completely** (right-click the system tray icon → Quit)
4. Double-click **`install.bat`**
5. Start Stream Deck

## Setup

1. Find **Ampdeck** in the actions list on the right side of the Stream Deck app
2. Drag **Album Art** to any button
3. Drag **Now Playing Strip** to between 1 and 4 dials
4. Optionally drag **Play/Pause**, **Previous**, **Next**, **Track Info**, or **Time Elapsed** to buttons
5. Click any Ampdeck action and configure:
   - **Server URL** — Your Plex server address (e.g. `http://192.168.1.100:32400`)
   - **Plex Token** — See [Finding Your Plex Token](#finding-your-plex-token) below
   - **Client Name** — Your computer's name as it appears in the Plex dashboard
6. Click **Test Connection** to verify

### Strip Configuration

Each dial panel can be configured independently:

| Setting | Options |
|---------|---------|
| **Display Mode** | Artist, Album, Track Title, or Time |
| **Font Size** | Small (12) through XX-Large (28) |
| **Total Panels** | How many panels share the progress bar (1–4) |
| **Panel Position** | This panel's position in the progress bar sequence, or None to disable |

For example, to have the progress bar span all 4 dials: set each panel to "4 panels" and positions 1, 2, 3, 4 from left to right.

### Sync Offset

Plex reports playback position with a slight delay. The **Time Offset** setting (default: 1500ms) compensates for this so Ampdeck stays in sync with what you hear. Increase it if the display feels behind, decrease it if it feels ahead.

## Finding Your Plex Token

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
| Plugin not showing in actions list | Make sure Stream Deck was fully closed before running `install.bat` |
| Connection test fails | Verify your server URL includes the port (`:32400`) and your token is correct |
| Nothing displays | Confirm Plexamp is actively playing and the client name matches exactly |
| Time display is off | Adjust the Sync Offset in the action settings (try values between 1000–2000) |
| Progress bar not aligned | Check that all strip panels have matching Total Panels values |

## Manual Installation

Copy the `com.rackemrack.ampdeck.sdPlugin` folder to:

```
%APPDATA%\Elgato\StreamDeck\Plugins\
```

Then restart Stream Deck.

## Support

If Ampdeck is useful to you, consider [buying me a coffee](https://ko-fi.com/rackemrack). It's totally optional — the plugin is free and always will be.

## License

[MIT](LICENSE)
