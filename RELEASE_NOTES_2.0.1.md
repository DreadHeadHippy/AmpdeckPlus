### ✨ New Feature: Time Display Toggle

The **Time Elapsed** button now works just like Plexamp! Click or tap the button to toggle between two display modes:

- **Default mode**: `2:26 / 5:00` (elapsed / total)
- **Toggled mode**: `2:26 / -2:34` (elapsed / -remaining)

Each Time Elapsed button maintains its own state, so you can have multiple buttons with different display modes if needed.

### 🐛 Bug Fixes

- **Rating preservation on track skip** - Fixed issue where rating a track and immediately skipping to the next track would not save the rating correctly to Plex. The rating `ratingKey` is now captured at button-press time (not when the 2-second debounce fires), ensuring the Plex server always receives the correct rating for the intended track. The Stream Deck display also correctly shows the new track's rating instead of incorrectly updating with the previous track's rating.
- Fixed ESLint warning: removed unused error variable in seek handler
- Fixed ESLint errors: added `AbortController` to global definitions

### 📦 Installation

1. Close Stream Deck completely (right-click system tray icon → Quit)
2. Download **`com.dreadheadhippy.ampdeckplus.streamDeckPlugin`** below
3. Double-click the file to install

For existing users, you can also use the update scripts (`install.bat` for Windows or `install.sh` for macOS) to preserve your settings.

### 🔗 Links

- [Full Changelog](https://github.com/DreadHeadHippy/AmpdeckPlus/blob/main/CHANGELOG.md)
- [Documentation](https://github.com/DreadHeadHippy/AmpdeckPlus#readme)
- [Report Issues](https://github.com/DreadHeadHippy/AmpdeckPlus/issues)
