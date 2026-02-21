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
        this.websocket = null;
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
        this.currentAlbumArt = null;
        this.dominantColor = "#E5A00D";
        this.currentRating = 0;
        this.userSetRatings = {};
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
