# Changelog

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
  - Increased seek interval to 500ms to prevent request queue overflow
  - Removed artificial throttling that caused deadlocks in tray mode
  - Seeking continues smoothly regardless of Stream Deck window state
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
