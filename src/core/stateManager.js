/**
 * State Manager
 * Centralized state management for the plugin
 * Replaces scattered global variables with organized state
 */

class StateManager {
    constructor() {
        // Initialize all state
        this.reset();
    }

    reset() {
        // Stream Deck connection
        this.connection = null;  // ConnectionManager instance (always current after reconnects)
        this.pluginUUID = null;
        this.actions = {}; // context -> { action, settings }
        this.globalSettings = {};

        // Track state
        this.currentTrack = null;
        this.currentAlbumArt = null;
        this.dominantColor = "#E5A00D";
        this.lastArtPath = null;

        // Playback state
        this.playbackState = "stopped"; // "playing", "paused", "stopped"
        this.currentPosition = 0;        // Current position in ms
        this.trackDuration = 0;          // Track length in ms
        this.displayProgress = 0;        // Progress percentage (0-100)
        this.lastPositionTimestamp = 0;  // When position was last updated

        // Metadata
        this.albumTrackCount = null;
        this.lastParentRatingKey = null;
        this.lastTimelineRatingKey = null;

        // Queue position (from playQueue when playing a playlist)
        this.queuePosition = null;   // 1-based position in queue
        this.queueTotal = null;      // total tracks in queue
        this.playQueueIsPlaylist = false; // true when queue spans multiple albums (playlist), false for album queues
        this.currentContainerKey = null; // containerKey of current playQueue (e.g. '/playQueues/123')

        // Player state
        this.currentVolume = 50;
        this.currentShuffle = 0;
        this.currentRepeat = 0;
        this.currentRating = 0;
        this.muteRestoreVolume = null;   // non-null = currently muted, value is restore target
        this.lastVolumeCommandTime = 0; // timestamp of last setVolume call

        // Rating cache (handles Plex metadata delays)
        this.userSetRatings = {}; // ratingKey -> rating value

        // UI state
        this.lastLayoutState = {};       // context -> layout key
        this.stripOverlays = {};         // context -> overlay state
        this.stripScrollState = {};      // context -> scroll state
        this.buttonHoldState = {};       // context -> hold state
        this.timeDisplayMode = {};       // context -> 'elapsed' or 'remaining'

        // Workers
        this.pollWorker = null;
        this.renderWorker = null;

        // Command tracking
        this.localCommandID = 0;

        // Pending operations
        this.ratingSaveTimer = null;
        this.pendingRatingContext = null;
        this.activeFadeTimer = null;     // generation number while fade is running, or null
        this.activeFadeContext = null;   // context string of the button driving the fade

        // Playlist carousel state (per dial context)
        this.carouselState = {};     // context -> { playlists: [], index: 0 }
        this.dialHoldState = {};     // context -> { pressTime, didLongPress }
        this.currentPlaylistName = null; // Name of the playlist currently playing (set by us)

        // Queue browser state (per dial context)
        this.queueBrowserState = {}; // context -> { items: [], cursorIndex: 0 }

        // Flag: queue items were kicked since the last track change.
        // Used to trigger a playMedia re-sync on the next track change so Plexamp
        // re-reads the queue with the new track as anchor and plans correct next-track.
        this.hadRecentKicks = false;
        // When the pre-buffered next track (index 0) is kicked, store the key of the
        // track that should become the new next song so playMedia can jump straight to it.
        this.kickedNextTrackKey = null;

        // Runtime display mode override (touch-toggle between playlists and queue)
        this.activeDisplayMode = {}; // context -> 'queue' | null
    }

    // Action management
    addAction(context, action, settings) {
        this.actions[context] = { action, settings: settings || {} };
    }

    removeAction(context) {
        delete this.actions[context];
        delete this.lastLayoutState[context];
        delete this.stripOverlays[context];
        delete this.stripScrollState[context];
        delete this.buttonHoldState[context];
        delete this.timeDisplayMode[context];
        delete this.carouselState[context];
        delete this.dialHoldState[context];
        delete this.queueBrowserState[context];
        delete this.activeDisplayMode[context];
    }

    getAction(context) {
        return this.actions[context];
    }

    hasActions() {
        return Object.keys(this.actions).length > 0;
    }

    getAllContexts() {
        return Object.keys(this.actions);
    }

    // Settings management
    updateGlobalSettings(settings) {
        this.globalSettings = { ...this.globalSettings, ...settings };
    }

    getGlobalSetting(key, defaultValue = null) {
        return this.globalSettings[key] ?? defaultValue;
    }

    updateActionSettings(context, settings) {
        if (this.actions[context]) {
            this.actions[context].settings = { ...this.actions[context].settings, ...settings };
        }
    }

    getActionSettings(context) {
        return this.actions[context]?.settings || {};
    }

    // Track management
    updateTrack(track) {
        this.currentTrack = track;
        if (track && track.ratingKey) {
            this.lastTimelineRatingKey = track.ratingKey;
        }
    }

    // Clear track info without touching playbackState.
    // Used when stopping playback while Plexamp is still running ('idle' state),
    // so the UI shows "Not Playing" with lit buttons rather than the dimmed "stopped" look.
    clearTrackInfo() {
        this.currentTrack = null;
        this.currentPosition = 0;
        this.trackDuration = 0;
        this.lastPositionTimestamp = 0;
        this.albumTrackCount = null;
        this.lastParentRatingKey = null;
        this.lastTimelineRatingKey = null;
        this.lastArtPath = null;
        this.queuePosition = null;
        this.queueTotal = null;
        this.playQueueIsPlaylist = false;
        this.currentContainerKey = null;
        this.currentAlbumArt = null;
        this.dominantColor = "#E5A00D";
        this.currentRating = 0;
        this.currentPlaylistName = null;
    }

    clearTrack() {
        this.currentTrack = null;
        this.playbackState = "stopped";
        this.currentPosition = 0;
        this.trackDuration = 0;
        this.lastPositionTimestamp = 0;
        this.albumTrackCount = null;
        this.lastParentRatingKey = null;
        this.lastTimelineRatingKey = null;
        this.lastArtPath = null;
        this.queuePosition = null;
        this.queueTotal = null;
        this.playQueueIsPlaylist = false;
        this.currentContainerKey = null;
        this.currentAlbumArt = null;
        this.dominantColor = "#E5A00D";
        this.currentRating = 0;
        this.userSetRatings = {};
        this.currentPlaylistName = null;
    }

    // Playback position
    updatePosition(position, timestamp = Date.now()) {
        this.currentPosition = position;
        this.lastPositionTimestamp = timestamp;
    }

    // Rating cache
    setUserRating(ratingKey, rating) {
        this.userSetRatings[ratingKey] = rating;
    }

    getUserRating(ratingKey) {
        return this.userSetRatings[ratingKey];
    }

    clearUserRating(ratingKey) {
        delete this.userSetRatings[ratingKey];
    }

    // Worker management
    setWorkers(pollWorker, renderWorker) {
        this.pollWorker = pollWorker;
        this.renderWorker = renderWorker;
    }

    clearWorkers() {
        this.pollWorker = null;
        this.renderWorker = null;
    }

    // Command ID
    getNextCommandID() {
        return ++this.localCommandID;
    }

    // Strip overlay management
    setStripOverlay(context, overlay) {
        this.stripOverlays[context] = overlay;
    }

    clearStripOverlay(context) {
        if (this.stripOverlays[context]?.timer) {
            clearTimeout(this.stripOverlays[context].timer);
        }
        delete this.stripOverlays[context];
    }

    getStripOverlay(context) {
        return this.stripOverlays[context];
    }

    // Playlist carousel state
    getCarouselState(context) {
        return this.carouselState[context] || null;
    }

    setCarouselState(context, carouselData) {
        this.carouselState[context] = carouselData;
    }

    clearCarouselState(context) {
        delete this.carouselState[context];
    }

    // Queue browser state
    getQueueBrowserState(context) {
        return this.queueBrowserState[context] || null;
    }

    setQueueBrowserState(context, data) {
        this.queueBrowserState[context] = data;
    }

    clearQueueBrowserState(context) {
        delete this.queueBrowserState[context];
    }

    // Runtime active display mode (touch-toggle override)
    getActiveDisplayMode(context) {
        return this.activeDisplayMode[context] || null;
    }

    setActiveDisplayMode(context, mode) {
        this.activeDisplayMode[context] = mode;
    }

    clearActiveDisplayMode(context) {
        delete this.activeDisplayMode[context];
    }

    // Time display mode
    toggleTimeDisplayMode(context) {
        const currentMode = this.timeDisplayMode[context] || 'elapsed';
        this.timeDisplayMode[context] = currentMode === 'elapsed' ? 'remaining' : 'elapsed';
        return this.timeDisplayMode[context];
    }

    getTimeDisplayMode(context) {
        return this.timeDisplayMode[context] || 'elapsed';
    }
}

// Singleton instance
const state = new StateManager();

export default state;
