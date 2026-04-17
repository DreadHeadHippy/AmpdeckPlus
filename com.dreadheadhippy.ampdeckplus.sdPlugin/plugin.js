(function () {
    'use strict';

    /**
     * Application Constants
     * Centralized configuration values
     */

    // Version
    const VERSION = '2.0.18';

    // Action identifiers
    const ACTIONS = {
        ALBUM_ART: 'com.dreadheadhippy.ampdeckplus.album-art',
        PLAY_PAUSE: 'com.dreadheadhippy.ampdeckplus.play-pause',
        PLAY: 'com.dreadheadhippy.ampdeckplus.play',
        PAUSE: 'com.dreadheadhippy.ampdeckplus.pause',
        NEXT: 'com.dreadheadhippy.ampdeckplus.next',
        PREVIOUS: 'com.dreadheadhippy.ampdeckplus.previous',
        INFO: 'com.dreadheadhippy.ampdeckplus.info',
        TIME: 'com.dreadheadhippy.ampdeckplus.time',
        RATING: 'com.dreadheadhippy.ampdeckplus.rating',
        SHUFFLE: 'com.dreadheadhippy.ampdeckplus.shuffle',
        REPEAT: 'com.dreadheadhippy.ampdeckplus.repeat',
        STRIP: 'com.dreadheadhippy.ampdeckplus.strip',
        VOLUME_UP: 'com.dreadheadhippy.ampdeckplus.volume-up',
        VOLUME_DOWN: 'com.dreadheadhippy.ampdeckplus.volume-down',
        PLAYLIST: 'com.dreadheadhippy.ampdeckplus.playlist',
        TRACK_TITLE: 'com.dreadheadhippy.ampdeckplus.track-title',
        SKIP_ALBUM: 'com.dreadheadhippy.ampdeckplus.skip-album',
        PREV_ALBUM: 'com.dreadheadhippy.ampdeckplus.prev-album'
    };

    // Timing constants
    const TIMING = {
        POLL_INTERVAL: 1000,           // Timeline poll rate (ms)
        RENDER_INTERVAL: 200,          // Display update rate (ms)
        HOLD_THRESHOLD: 400,           // Press duration for hold action (ms)
        SEEK_INTERVAL: 500,            // Seek repeat rate when holding (ms) - increased to prevent queue overflow when Stream Deck is in tray
        SEEK_AMOUNT: 10000,            // Seek distance per step (ms)
        RATING_SAVE_DELAY: 1500,      // Debounce delay for rating saves (ms)
        SCROLL_PAUSE: 2000,            // Pause before scrolling text (ms)
        RECONNECT_DELAY: 3000,         // WebSocket reconnect delay (ms)
        RECONNECT_MAX_DELAY: 30000,    // Maximum reconnect delay (ms)
        QUEUE_BROWSER_MAX: 100         // Hard cap on Up Next queue items stored in memory
    };

    // Scrolling text
    const SCROLL = {
        SPEED: 30,                     // Pixels per second
        GAP: 40,                       // Gap between repeat (px)
        PAUSE: 2000                    // Pause at start/end (ms)
    };

    // Volume
    const VOLUME = {
        STEP: 5,                       // Volume change per step
        MIN: 0,
        MAX: 100,
        FADE_DURATION: 3000,           // Total fade-out duration in ms (100 → 0)
        FADE_INTERVAL: 16,             // Minimum ms between serial doFadeTick calls (≈ 60fps poll)
        FADE_TIMEOUT_MS: 200           // Abort each fade HTTP call after this many ms and move on
    };

    // Rating
    const RATING = {
        HALF_STAR: 1,
        FULL_STAR: 2,
        MAX: 10,
        SINGLE_LIKED: 10,    // Plexamp "liked" state — filled star (highest rating)
        SINGLE_DISLIKED: 2   // Plexamp "disliked" state — filled star with line through (lowest positive rating)
    };

    // Colors
    const COLORS = {
        DEFAULT: '#E5A00D',            // Fallback accent color
        BLACK: '#000000',
        DARK_GRAY: '#333333',
        MEDIUM_GRAY: '#777777',
        WHITE: '#FFFFFF'
    };

    // Canvas sizes
    const CANVAS = {
        BUTTON_SIZE: 144};

    // Plex defaults
    const PLEX = {
        DEFAULT_PLAYER_URL: 'http://localhost:32500',
        CLIENT_IDENTIFIER: 'com.dreadheadhippy.ampdeckplus'};

    // Logging
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    const MAX_LOG_ENTRIES = 500;

    /**
     * Logging System
     * Centralized logging with level filtering and buffer management
     */


    class Logger {
        constructor() {
            this.logs = [];
            this.currentLevel = LOG_LEVELS.INFO;
            this.connection = null;
        }

        setLevel(level) {
            this.currentLevel = level;
        }

        setConnection(connection) {
            this.connection = connection;
        }

        debug(msg, data) {
            this.logAt(LOG_LEVELS.DEBUG, msg, data);
        }

        info(msg, data) {
            this.logAt(LOG_LEVELS.INFO, msg, data);
        }

        warn(msg, data) {
            this.logAt(LOG_LEVELS.WARN, msg, data);
        }

        error(msg, data) {
            this.logAt(LOG_LEVELS.ERROR, msg, data);
        }

        logAt(level, msg, data) {
            if (level < this.currentLevel) return;

            const levelName = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level);
            const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
            const sanitized = this.sanitizeMessage(msg);
            
            let logEntry = `[${timestamp}] [${levelName}] ${sanitized}`;
            if (data !== undefined) {
                logEntry += ' ' + JSON.stringify(data, null, 2);
            }

            this.logs.push(logEntry);
            if (this.logs.length > MAX_LOG_ENTRIES) {
                this.logs.shift();
            }

            console.log(`[${levelName}]`, sanitized, data);

            if (this.currentLevel === LOG_LEVELS.DEBUG && this.connection && this.connection.isConnected()) {
                this.connection.send({
                    event: 'logMessage',
                    payload: { message: logEntry }
                });
            }
        }

        sanitizeMessage(msg) {
            if (typeof msg !== 'string') return String(msg);
            return msg.replace(/X-Plex-Token=[^&\s]*/gi, 'X-Plex-Token=***');
        }

        dump() {
            console.log("=== AMPDECK+ DEBUG LOGS ===");
            console.log(this.logs.join('\n'));
            return this.logs.join('\n');
        }

        clear() {
            this.logs = [];
            console.log("Debug logs cleared");
        }
    }

    // Singleton instance
    const logger = new Logger();

    // Expose globally for debugging
    if (typeof window !== 'undefined') {
        window.dumpLogs = () => {
            alert(`Logs copied to console! See console tab (F12).\n\nTotal entries: ${logger.logs.length}`);
            return logger.dump();
        };
        window.clearLogs = () => logger.clear();
    }

    /**
     * Connection Manager
     * Handles WebSocket connection to Stream Deck with automatic reconnection
     */


    class ConnectionManager {
        constructor(messageHandler) {
            this.messageHandler = messageHandler;
            this.websocket = null;
            this.pluginUUID = null;
            this.port = null;
            this.registerEvent = null;
            this.reconnectAttempts = 0;
            this.reconnectTimer = null;
            this.isIntentionalClose = false;
        }

        /**
         * Connect to Stream Deck
         */
        connect(port, pluginUUID, registerEvent) {
            this.port = port;
            this.pluginUUID = pluginUUID;
            this.registerEvent = registerEvent;
            this.isIntentionalClose = false;

            try {
                this.websocket = new WebSocket(`ws://127.0.0.1:${port}`);
                this.setupHandlers();
                logger.info(`Connecting to Stream Deck on port ${port}...`);
            } catch (error) {
                logger.error('Failed to create WebSocket:', error);
                this.scheduleReconnect();
            }
        }

        /**
         * Set up WebSocket event handlers
         */
        setupHandlers() {
            this.websocket.onopen = () => {
                this.reconnectAttempts = 0;
                this.send({
                    event: this.registerEvent,
                    uuid: this.pluginUUID
                });
                this.send({
                    event: 'getGlobalSettings',
                    context: this.pluginUUID
                });
                logger.info('✓ Connected to Stream Deck');
                console.log("==========================================");
                console.log("AMPDECK+ v2.0.0 - PLUGIN CONNECTED");
                console.log("Professional Edition - Modular Architecture");
                console.log("==========================================");
            };

            this.websocket.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    this.messageHandler(data);
                } catch (error) {
                    logger.error('Failed to parse message:', error);
                }
            };

            this.websocket.onerror = (error) => {
                logger.error('WebSocket error:', error);
            };

            this.websocket.onclose = (event) => {
                if (this.isIntentionalClose) {
                    logger.info('WebSocket closed intentionally');
                    return;
                }

                logger.warn(`WebSocket closed unexpectedly (code: ${event.code})`);
                this.websocket = null;
                this.scheduleReconnect();
            };
        }

        /**
         * Schedule automatic reconnection
         */
        scheduleReconnect() {
            if (this.isIntentionalClose || this.reconnectTimer) {
                return;
            }

            this.reconnectAttempts++;
            
            // Exponential backoff: 3s, 6s, 12s, 24s, max 30s
            const delay = Math.min(
                TIMING.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
                TIMING.RECONNECT_MAX_DELAY
            );

            logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                if (this.port && this.pluginUUID && this.registerEvent) {
                    this.connect(this.port, this.pluginUUID, this.registerEvent);
                }
            }, delay);
        }

        /**
         * Send message to Stream Deck
         */
        send(data) {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify(data));
                return true;
            } else {
                logger.warn('Cannot send message: WebSocket not connected');
                return false;
            }
        }

        /**
         * Check if connected
         */
        isConnected() {
            return this.websocket && this.websocket.readyState === WebSocket.OPEN;
        }

        /**
         * Close connection
         */
        close() {
            this.isIntentionalClose = true;
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            if (this.websocket) {
                this.websocket.close();
                this.websocket = null;
            }

            logger.info('Connection closed');
        }

        /**
         * Get current WebSocket state
         */
        getState() {
            if (!this.websocket) return 'DISCONNECTED';
            
            const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
            return states[this.websocket.readyState] || 'UNKNOWN';
        }
    }

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

    /**
     * Helper Utilities
     * Common utility functions used throughout the plugin
     */

    /**
     * Format milliseconds to M:SS or H:MM:SS
     */
    function formatTime(ms) {
        if (!ms || ms <= 0) return "0:00";
        const sec = Math.floor(ms / 1000);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Measure text width for canvas rendering
     */
    function measureTextWidth(text, font) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = font;
        return ctx.measureText(text).width;
    }

    /**
     * Clamp a value between min and max
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Create a Web Worker from inline code
     */
    function createWorker(intervalMs) {
        const blob = new Blob([`
        var interval = null;
        self.onmessage = function(e) {
            if (e.data === "start" && !interval) {
                interval = setInterval(function() {
                    self.postMessage("tick");
                }, ${intervalMs});
            } else if (e.data === "stop" && interval) {
                clearInterval(interval);
                interval = null;
            }
        };
    `], { type: 'application/javascript' });
        return new Worker(URL.createObjectURL(blob));
    }

    /**
     * Safely terminate a worker
     */
    function terminateWorker(worker) {
        if (worker) {
            worker.postMessage("stop");
            worker.terminate();
        }
    }

    /**
     * Format rating (0-10) as star characters
     * @param {number} rating - Rating value from 0-10 (where 2 = 1 star, 10 = 5 stars)
     * @param {string} mode - 'half' for half-star increments, 'full' for full stars only, 'single' for single-star toggle
     * @returns {string} Star characters (★ = full, ⯨ = half, ☆ = empty) or ★/☆ for single mode
     */
    function formatRating(rating, mode) {
        if (mode === 'single') {
            return rating > 0 ? '★' : '☆';
        }
        if (rating === 0) return "☆☆☆☆☆";
        
        const fullStars = Math.floor(rating / 2);
        const hasHalfStar = mode === "half" && (rating % 2 === 1);
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        let result = "";
        for (let j = 0; j < fullStars; j++) result += "★";
        if (hasHalfStar) result += "⯨";
        for (let k = 0; k < emptyStars; k++) result += "☆";
        
        return result;
    }

    /**
     * Plex Connection
     * Handles communication with Plex player (local) and server (remote)
     */ 


    class PlexConnection {
        constructor() {
            this.playerUrl = PLEX.DEFAULT_PLAYER_URL;
            this.serverUrl = null;
            this.token = null;
            this._serverMachineId = null;
        }

        /**
         * Configure connection settings
         */
        configure(serverUrl, token, playerUrl = null) {
            this.serverUrl = serverUrl;
            this.token = token;
            this._serverMachineId = null; // reset cache when server URL changes
            if (playerUrl) {
                this.playerUrl = playerUrl;
            }
            logger.info('Plex connection configured', {
                server: serverUrl,
                player: this.playerUrl
            });
        }

        /**
         * Reset connection to unconfigured state
         */
        reset() {
            this.playerUrl = PLEX.DEFAULT_PLAYER_URL;
            this.serverUrl = null;
            this.token = null;
            this._serverMachineId = null;
            logger.info('Plex connection reset');
        }

        /**
         * Check if connection is properly configured
         */
        isConfigured() {
            return !!(this.serverUrl && this.token);
        }

        /**
         * Create standard Plex headers
         */
        createHeaders(includeToken = true) {
            const headers = {
                'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
                'X-Plex-Product': 'Ampdeck+',
                'X-Plex-Version': '2.0.0',
                'X-Plex-Platform': 'Stream Deck',
                'X-Plex-Device': 'Stream Deck'
            };

            if (includeToken && this.token) {
                headers['X-Plex-Token'] = this.token;
            }

            return headers;
        }

        /**
         * Execute command on local player (with server fallback for non-playMedia commands)
         * @param {string} path
         * @param {object|null} extraParams
         * @param {number} timeoutMs - timeout for the player request (default 1000)
         */
        async playerCommand(path, extraParams = null, timeoutMs = 1000, noFallback = false) {
            // Prevent commands when not configured (signed out)
            if (!this.isConfigured()) {
                logger.debug('Player command blocked: not configured');
                throw new Error('Plex connection not configured');
            }

            const commandID = state.getNextCommandID();
            let url = `${this.playerUrl}${path}`;

            // Add parameters
            const params = new URLSearchParams({ commandID });
            if (extraParams) {
                const extra = new URLSearchParams(extraParams);
                extra.forEach((value, key) => params.append(key, value));
            }

            url += (url.includes('?') ? '&' : '?') + params.toString();

            logger.debug(`Player command: ${path}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(false),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                logger.debug(`Player command success: ${path}`);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                // playMedia must reach the local player directly — server fallback doesn't
                // work when idle (no connected client machineId available). Throw clearly.
                if (path.includes('playMedia')) {
                    logger.error(`playMedia command failed: ${error.message}`);
                    throw error;
                }
                if (noFallback) {
                    // During fade: timeout is expected — Plexamp already applied the change
                    // on receipt, we just don't need to wait for the HTTP confirmation.
                    logger.debug(`Player command fade-abort (${path}): ${error.message}`);
                    return null;
                }
                logger.warn(`Player command failed (${path}): ${error.message}, falling back to server`);
                return this.serverCommand(path, extraParams);
            }
        }

        /**
         * Execute command via Plex server
         */
        async serverCommand(path, extraParams = null) {
            // Prevent commands when not configured (signed out)
            if (!this.isConfigured()) {
                logger.debug('Server command blocked: not configured');
                throw new Error('Plex connection not configured');
            }

            const machineId = this.getClientId();
            
            if (!machineId || !this.serverUrl || !this.token) {
                const error = 'Server command failed: missing machineId, server URL, or token';
                logger.error(error);
                throw new Error(error);
            }

            const params = new URLSearchParams({
                commandID: 1,
                'X-Plex-Target-Client-Identifier': machineId
            });

            if (extraParams) {
                const extra = new URLSearchParams(extraParams);
                extra.forEach((value, key) => params.append(key, value));
            }

            const url = `${this.serverUrl}${path}?${params.toString()}`;

            logger.debug(`Server command: ${path}`);

            // Create AbortController with 2 second timeout for server requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                logger.debug(`Server command success: ${path}`);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                logger.error(`Server command failed (${path}): ${error.message}`);
                throw error;
            }
        }

        /**
         * Get client machine identifier from current track
         */
        getClientId() {
            return state.currentTrack?.Player?.machineIdentifier || null;
        }

        /**
         * Check whether the local Plexamp player is reachable at all.
         * Returns true if Plexamp responds with ANY HTTP reply (even if nothing is playing).
         * Returns false only on a network error (connection refused / timeout = not running).
         * This is distinct from fetchTimeline(), which returns null both when Plexamp is
         * unreachable AND when it is running but idle (no music Timeline in the XML).
         */
        async isPlexampReachable() {
            const url = `${this.playerUrl}/player/timeline/poll?wait=0&commandID=0`;
            try {
                await fetch(url, {
                    headers: this.createHeaders(false),
                    signal: AbortSignal.timeout(2000)
                });
                return true; // any HTTP response → Plexamp is up
            } catch {
                return false; // network error → not running
            }
        }

        /**
         * Fetch timeline from local player
         */
        async fetchTimeline() {
            if (!this.token || !this.serverUrl) {
                return null;
            }

            const params = new URLSearchParams({
                commandID: state.getNextCommandID(),
                'X-Plex-Token': this.token,
                wait: 0
            });

            const url = `${this.playerUrl}/player/timeline/poll?${params.toString()}`;

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(false),
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                return this.parseTimelineXML(text);
            } catch (error) {
                logger.debug(`Timeline fetch failed: ${error.message}`);
                return null;
            }
        }

        /**
         * Parse timeline XML response
         */
        parseTimelineXML(xmlText) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'text/xml');
            const timeline = doc.querySelector('Timeline[type="music"]');
            
            if (!timeline) {
                return null;
            }

            return {
                state: timeline.getAttribute('state'),
                time: parseInt(timeline.getAttribute('time')) || 0,
                duration: parseInt(timeline.getAttribute('duration')) || 0,
                ratingKey: timeline.getAttribute('ratingKey'),
                key: timeline.getAttribute('key'),
                containerKey: timeline.getAttribute('containerKey'),
                volume: parseInt(timeline.getAttribute('volume')) || 50,
                shuffle: parseInt(timeline.getAttribute('shuffle')) || 0,
                repeat: parseInt(timeline.getAttribute('repeat')) || 0,
                machineIdentifier: timeline.getAttribute('machineIdentifier'),
                protocol: timeline.getAttribute('protocol'),
                address: timeline.getAttribute('address'),
                port: timeline.getAttribute('port'),
                token: timeline.getAttribute('token')
            };
        }

        /**
         * Fetch metadata from server
         */
        async fetchMetadata(ratingKey) {
            if (!this.serverUrl || !this.token) {
                throw new Error('Server not configured');
            }

            const url = `${this.serverUrl}/library/metadata/${ratingKey}`;

            logger.debug(`Fetching metadata for ratingKey: ${ratingKey}`);

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                return this.parseMetadataXML(text);
            } catch (error) {
                logger.error(`Metadata fetch failed: ${error.message}`);
                throw error;
            }
        }

        /**
         * Parse metadata XML response
         */
        parseMetadataXML(xmlText) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'text/xml');
            const track = doc.querySelector('Track');
            
            if (!track) {
                return null;
            }

            const media = track.querySelector('Media');
            
            return {
                ratingKey: track.getAttribute('ratingKey'),
                key: track.getAttribute('key'),
                parentRatingKey: track.getAttribute('parentRatingKey'),
                grandparentRatingKey: track.getAttribute('grandparentRatingKey'),
                title: track.getAttribute('title'),
                parentTitle: track.getAttribute('parentTitle'),
                grandparentTitle: track.getAttribute('grandparentTitle'),
                userRating: parseFloat(track.getAttribute('userRating')) || null,
                thumb: track.getAttribute('thumb'),
                parentThumb: track.getAttribute('parentThumb'),
                grandparentThumb: track.getAttribute('grandparentThumb'),
                duration: parseInt(track.getAttribute('duration')) || 0,
                index: parseInt(track.getAttribute('index')) || null,
                Media: media ? [{
                    audioCodec: media.getAttribute('audioCodec'),
                    bitrate: parseInt(media.getAttribute('bitrate')) || null
                }] : []
            };
        }

        /**
         * Fetch album art
         * Requests via Plex photo transcoder at button-native resolution to minimise download size.
         */
        async fetchAlbumArt(thumbPath, serverUrl = null, token = null, size = CANVAS.BUTTON_SIZE) {
            const baseUrl = serverUrl || this.serverUrl;
            const url = `${baseUrl}/photo/:/transcode?width=${size}&height=${size}&url=${encodeURIComponent(thumbPath)}&minSize=1`;
            const authToken = token || this.token;

            logger.debug(`Fetching album art: ${thumbPath} at ${size}x${size}`);

            try {
                const response = await fetch(url, {
                    headers: { 'X-Plex-Token': authToken }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const blob = await response.blob();
                
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                logger.error(`Album art fetch failed: ${error.message}`);
                throw error;
            }
        }

        /**
         * Fetch album track count
         */
        async fetchAlbumTrackCount(parentRatingKey) {
            if (!this.serverUrl || !this.token) {
                return null;
            }

            const url = `${this.serverUrl}/library/metadata/${parentRatingKey}/children`;

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const tracks = doc.querySelectorAll('Track');
                
                return tracks.length;
            } catch (error) {
                logger.error(`Failed to fetch album track count: ${error.message}`);
                return null;
            }
        }
        /**
         * PUT to the server-side playQueue to toggle shuffle (or repeat).
         * Plexamp shuffles albums by reordering the actual queue on the server rather than
         * just flipping a local flag, so setParameters alone is insufficient. This call
         * makes the server reorder the queue and push a notification to Plexamp.
         */
        async updatePlayQueueShuffle(containerKey, shuffle) {
            if (!this.serverUrl || !this.token) return;

            const url = `${this.serverUrl}${containerKey}?shuffle=${shuffle}`;

            try {
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: this.createHeaders(true)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                logger.debug(`PlayQueue shuffle set to ${shuffle}`);
            } catch (error) {
                logger.error(`Failed to update playQueue shuffle: ${error.message}`);
            }
        }

        /**
         * Fetch play queue position data.
         * Returns { position (1-based), total } or null.
         */
        async fetchPlayQueue(containerKey) {
            if (!this.serverUrl || !this.token) {
                return null;
            }

            // window=10000 ensures we see the full queue for parentRatingKey diversity detection.
            // Without it, the windowed response (~50 items around current position) can return
            // only same-album tracks even in a playlist, causing false album-queue detection.
            const url = `${this.serverUrl}${containerKey}?window=10000`;

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const container = doc.querySelector('MediaContainer');

                if (!container) return null;

                const offset = parseInt(container.getAttribute('playQueueSelectedItemOffset')) || 0;
                const total = parseInt(container.getAttribute('playQueueTotalCount')) || 0;
                const sourceURI = container.getAttribute('playQueueSourceURI') || '';

                if (!total) return null;

                // Detect playlist queue by checking parentRatingKey diversity across all tracks.
                // Album queues have one unique parentRatingKey; playlist queues span multiple albums.
                // sourceURI is a secondary signal for single-album playlists (rare edge case).
                const tracks = doc.querySelectorAll('Track');
                const albumKeys = new Set();
                tracks.forEach(t => {
                    const pk = t.getAttribute('parentRatingKey');
                    if (pk) albumKeys.add(pk);
                });
                const isPlaylistQueue = albumKeys.size > 1 || sourceURI.toLowerCase().includes('playlist');

                return { position: offset + 1, total, isPlaylistQueue };
            } catch (error) {
                logger.error(`Failed to fetch play queue: ${error.message}`);
                return null;
            }
        }

        /**
         * Get (and cache) the Plex server's own machineIdentifier.
         * Fetched from the server root endpoint the first time it is needed.
         */
        async fetchServerMachineId() {
            if (this._serverMachineId) return this._serverMachineId;

            if (!this.serverUrl || !this.token) {
                throw new Error('Server not configured');
            }

            const url = `${this.serverUrl}/?X-Plex-Token=${this.token}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const root = doc.querySelector('MediaContainer');
                const id = root?.getAttribute('machineIdentifier');

                if (!id) throw new Error('machineIdentifier not found in server response');

                this._serverMachineId = id;
                logger.debug(`Server machineIdentifier: ${id}`);
                return id;
            } catch (error) {
                clearTimeout(timeoutId);
                logger.error(`Failed to fetch server machineIdentifier: ${error.message}`);
                throw error;
            }
        }

        /**
         * Fetch list of audio playlists from the Plex server.
         * Returns an array of { ratingKey, title, leafCount } objects.
         */
        async fetchPlaylists() {
            if (!this.serverUrl || !this.token) {
                throw new Error('Server not configured');
            }

            const url = `${this.serverUrl}/playlists?playlistType=audio&X-Plex-Token=${this.token}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const items = doc.querySelectorAll('Playlist');

                return Array.from(items).map(item => ({
                    ratingKey: item.getAttribute('ratingKey'),
                    title: item.getAttribute('title'),
                    leafCount: parseInt(item.getAttribute('leafCount')) || 0,
                    compositePath: item.getAttribute('thumb') || item.getAttribute('composite') || null
                }));
            } catch (error) {
                logger.error(`Failed to fetch playlists: ${error.message}`);
                throw error;
            }
        }

        /**
         * Fetch all items from an existing playQueue and identify the selected item.
         * Returns { selectedItemID, items: [{playQueueItemID, parentRatingKey, key}] }
         * Used by skipToNextAlbum to locate the first track of the next album.
         */
        async fetchPlayQueueItems(containerKey) {
            if (!this.serverUrl || !this.token) return null;

            // window=10000 ensures we receive the full queue rather than only the
            // default windowed page (~50 items centred on the current track), which
            // would cause large albums to hide the next album's tracks from view.
            const url = `${this.serverUrl}${containerKey}?window=10000`;

            try {
                const response = await fetch(url, { headers: this.createHeaders(true) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const container = doc.querySelector('MediaContainer');
                if (!container) return null;

                const selectedItemID = container.getAttribute('playQueueSelectedItemID');
                const items = Array.from(doc.querySelectorAll('Track')).map(track => ({
                    playQueueItemID: track.getAttribute('playQueueItemID'),
                    ratingKey: track.getAttribute('ratingKey'),
                    parentRatingKey: track.getAttribute('parentRatingKey'),
                    key: track.getAttribute('key'),
                    title: track.getAttribute('title') || '',
                    artist: track.getAttribute('grandparentTitle') || '',
                    userRating: parseFloat(track.getAttribute('userRating')) || null
                }));

                return { selectedItemID, items };
            } catch (error) {
                logger.error(`Failed to fetch play queue items: ${error.message}`);
                return null;
            }
        }

        /**
         * Remove a single item from an existing playQueue on the server.
         * @param {string} queueID  - numeric queue ID (from containerKey e.g. '/playQueues/12345')
         * @param {string} playQueueItemID - the item's playQueueItemID
         */
        async removeFromQueue(queueID, playQueueItemID) {
            if (!this.serverUrl || !this.token) return;

            const url = `${this.serverUrl}/playQueues/${queueID}/items/${playQueueItemID}`;

            try {
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: this.createHeaders(true),
                    signal: AbortSignal.timeout(3000)
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                logger.debug(`Removed item ${playQueueItemID} from queue ${queueID}`);
            } catch (error) {
                logger.error(`Failed to remove from queue: ${error.message}`);
                throw error;
            }
        }

        /**
         * Create a playQueue on the server from a playlist ratingKey.
         * Returns the playQueueID string.
         */
        async createPlayQueue(ratingKey, shuffle = false) {
            const machineId = await this.fetchServerMachineId();
            const uri = `server://${machineId}/com.plexapp.plugins.library/playlists/${ratingKey}`;

            if (!this.serverUrl || !this.token) {
                throw new Error('Server not configured');
            }

            const params = new URLSearchParams({
                type: 'audio',
                uri,
                shuffle: shuffle ? 1 : 0,
                repeat: 0,
                'X-Plex-Token': this.token
            });

            const url = `${this.serverUrl}/playQueues?${params.toString()}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: this.createHeaders(true),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/xml');
                const container = doc.querySelector('MediaContainer');
                const playQueueID = container?.getAttribute('playQueueID');

                if (!playQueueID) throw new Error('playQueueID not found in response');

                logger.debug(`Created playQueue ${playQueueID} for playlist ${ratingKey}`);
                return playQueueID;
            } catch (error) {
                clearTimeout(timeoutId);
                logger.error(`Failed to create playQueue: ${error.message}`);
                throw error;
            }
        }
    }

    // Singleton instance
    const plexConnection = new PlexConnection();

    /**
     * Playback Controller
     * High-level playback control functions
     */


    class PlaybackController {
        /**
         * Toggle play/pause
         */
        async togglePlayPause() {
            if (state.playbackState === 'stopped') {
                return;
            }

            const command = state.playbackState === 'playing' ? 'pause' : 'play';
            
            try {
                await plexConnection.playerCommand(`/player/playback/${command}`);
                
                // Update state optimistically
                if (state.playbackState === 'playing') {
                    state.playbackState = 'paused';
                    state.lastPositionTimestamp = 0;
                } else {
                    state.playbackState = 'playing';
                    state.lastPositionTimestamp = Date.now();
                }
                
                logger.debug(`Playback ${command}ed`);
            } catch (error) {
                logger.error(`Failed to ${command}: ${error.message}`);
            }
        }

        /**
         * Play
         */
        async play() {
            try {
                await plexConnection.playerCommand('/player/playback/play');
                state.playbackState = 'playing';
                state.lastPositionTimestamp = Date.now();
                logger.debug('Playback started');
            } catch (error) {
                logger.error(`Failed to play: ${error.message}`);
            }
        }

        /**
         * Pause
         */
        async pause() {
            try {
                await plexConnection.playerCommand('/player/playback/pause');
                state.playbackState = 'paused';
                state.lastPositionTimestamp = 0;
                logger.debug('Playback paused');
            } catch (error) {
                logger.error(`Failed to pause: ${error.message}`);
            }
        }

        /**
         * Stop playback
         */
        async stop() {
            try {
                await plexConnection.playerCommand('/player/playback/stop');
                // Use 'idle' — Plexamp is running but nothing is queued/playing.
                // 'stopped' is reserved for Plexamp being unreachable/not running,
                // which is what triggers the dimmed-button look.
                state.playbackState = 'idle';
                state.clearTrackInfo();
                logger.debug('Playback stopped');
            } catch (error) {
                logger.error(`Failed to stop: ${error.message}`);
            }
        }

        /**
         * Skip to next track
         */
        async skipNext() {
            try {
                await plexConnection.playerCommand('/player/playback/skipNext');
                logger.debug('Skipped to next track');
            } catch (error) {
                logger.error(`Failed to skip next: ${error.message}`);
            }
        }

        /**
         * Skip to previous track
         */
        async skipPrevious() {
            try {
                await plexConnection.playerCommand('/player/playback/skipPrevious');
                logger.debug('Skipped to previous track');
            } catch (error) {
                logger.error(`Failed to skip previous: ${error.message}`);
            }
        }

        /**
         * Seek by offset (relative to current position)
         */
        async seek(offsetMs) {
            const newPos = clamp(
                state.currentPosition + offsetMs,
                0,
                state.trackDuration
            );
            await this.seekTo(newPos);
        }

        /**
         * Seek to absolute position
         */
        async seekTo(positionMs) {
            const newPos = clamp(positionMs, 0, state.trackDuration);

            try {
                await plexConnection.playerCommand(
                    '/player/playback/seekTo',
                    `offset=${Math.round(newPos)}`
                );
                
                state.updatePosition(newPos);
                logger.debug(`Seeked to ${newPos}ms`);
            } catch (error) {
                logger.error(`Failed to seek: ${error.message}`);
            }
        }

        /**
         * Set volume
         */
        async setVolume(level, timeoutMs = 1000, noFallback = false) {
            const volume = clamp(level, VOLUME.MIN, VOLUME.MAX);
            const previousVolume = state.currentVolume;
            
            // Optimistic update + guard so timeline doesn't overwrite us mid-flight
            state.currentVolume = volume;
            state.lastVolumeCommandTime = Date.now();
            
            try {
                await plexConnection.playerCommand(
                    '/player/playback/setParameters',
                    `volume=${volume}`,
                    timeoutMs,
                    noFallback
                );
                logger.debug(`Volume set to ${volume}`);
            } catch (error) {
                // Command failed (network issue, 1s abort, etc.) — revert optimistic
                // state and drop the guard so the next timeline poll can correct things
                state.currentVolume = previousVolume;
                state.lastVolumeCommandTime = 0;
                logger.error(`Failed to set volume: ${error.message}`);
            }
        }

        /**
         * Adjust volume by delta
         */
        async adjustVolume(delta) {
            await this.setVolume(state.currentVolume + delta);
        }

        /**
         * Toggle shuffle
         */
        async toggleShuffle() {
            const newShuffle = state.currentShuffle ? 0 : 1;

            // setParameters tells the local player to flip its shuffle flag (works for playlists
            // and other clients). For album queues Plexamp ignores this and instead expects the
            // server-side playQueue to be reordered via a PUT — which triggers a server notification
            // that makes Plexamp reload the queue in the new order. We do both.
            try {
                await plexConnection.playerCommand(
                    '/player/playback/setParameters',
                    `shuffle=${newShuffle}`
                );
            } catch (error) {
                logger.warn(`setParameters shuffle failed: ${error.message}`);
            }

            if (state.currentContainerKey) {
                await plexConnection.updatePlayQueueShuffle(state.currentContainerKey, newShuffle);
            }

            state.currentShuffle = newShuffle;
            logger.debug(`Shuffle ${newShuffle ? 'enabled' : 'disabled'}`);
        }

        /**
         * Toggle repeat
         */
        async toggleRepeat() {
            const newRepeat = (state.currentRepeat + 1) % 3; // 0=off, 1=all, 2=one
            
            try {
                await plexConnection.playerCommand(
                    '/player/playback/setParameters',
                    `repeat=${newRepeat}`
                );
                
                state.currentRepeat = newRepeat;
                logger.debug(`Repeat mode: ${newRepeat}`);
            } catch (error) {
                logger.error(`Failed to toggle repeat: ${error.message}`);
            }
        }

        /**
         * Set rating
         * @param {number} rating - Rating value 0-10
         * @param {string} [ratingKeyOverride] - Explicit ratingKey; falls back to current track
         */
        async setRating(rating, ratingKeyOverride) {
            const ratingKey = ratingKeyOverride || state.currentTrack?.ratingKey;
            if (!ratingKey) {
                logger.warn('Cannot set rating: no current track');
                return;
            }
            
            try {
                await plexConnection.serverCommand(
                    `/:/rate`,
                    `key=${ratingKey}&identifier=com.plexapp.plugins.library&rating=${rating}`
                );
                
                // Cache the user-set rating
                state.setUserRating(ratingKey, rating);
                
                // Only update current display rating if we're rating the current track
                if (ratingKey === state.currentTrack?.ratingKey) {
                    state.currentRating = rating;
                }
                
                logger.info(`Rating set to ${rating / 2} stars`);
            } catch (error) {
                logger.error(`Failed to set rating: ${error.message}`);
            }
        }

        /**
         * Adjust rating by delta
         */
        async adjustRating(delta) {
            const newRating = clamp(
                state.currentRating + delta,
                0,
                10
            );
            
            await this.setRating(newRating);
        }

        /**
         * Skip to the first track of the next album in the current playQueue.
         * Works when playing any playlist or album queue; silently no-ops if already
         * on the last album or not playing from a playQueue.
         */
        async skipToNextAlbum() {
            const containerKey = state.currentContainerKey;

            if (!containerKey || !containerKey.startsWith('/playQueues/')) {
                logger.warn('Skip album: not playing from a play queue');
                return;
            }

            try {
                const queue = await plexConnection.fetchPlayQueueItems(containerKey);
                if (!queue || !queue.items.length) return;

                const { selectedItemID, items } = queue;

                const currentIdx = items.findIndex(i => i.playQueueItemID === selectedItemID);
                if (currentIdx === -1) return;

                // Derive the current album from the queue snapshot — not from state.currentTrack,
                // which may be stale (async metadata fetch). This ensures both the queue position
                // and the album key come from the same consistent response.
                const currentAlbumKey = items[currentIdx].parentRatingKey;
                if (!currentAlbumKey) return;

                const nextItem = items.slice(currentIdx + 1).find(i => i.parentRatingKey !== currentAlbumKey);
                if (!nextItem) {
                    logger.debug('Skip album: already on the last album in queue');
                    return;
                }

                await plexConnection.playerCommand(
                    '/player/playback/skipTo',
                    { key: nextItem.key, playQueueItemID: nextItem.playQueueItemID }
                );
                logger.info(`Skipped to next album (playQueueItemID: ${nextItem.playQueueItemID})`);
            } catch (error) {
                logger.error(`Failed to skip to next album: ${error.message}`);
            }
        }

        /**
         * Skip to the first track of the previous album in the current playQueue.
         * Walks backward from the current position to find the first track of the
         * album before the current one. No-ops if already on the first album.
         */
        async skipToPrevAlbum() {
            const containerKey = state.currentContainerKey;

            if (!containerKey || !containerKey.startsWith('/playQueues/')) {
                logger.warn('Prev album: not playing from a play queue');
                return;
            }

            try {
                const queue = await plexConnection.fetchPlayQueueItems(containerKey);
                if (!queue || !queue.items.length) return;

                const { selectedItemID, items } = queue;

                const currentIdx = items.findIndex(i => i.playQueueItemID === selectedItemID);
                if (currentIdx === -1) return;

                // Derive the current album from the queue snapshot (same reasoning as skipToNextAlbum).
                const currentAlbumKey = items[currentIdx].parentRatingKey;
                if (!currentAlbumKey) return;

                // Walk backward to find an item belonging to a different (earlier) album,
                // then jump to the very first track of that album.
                const prevItem = items.slice(0, currentIdx).reverse().find(i => i.parentRatingKey !== currentAlbumKey);
                if (!prevItem) {
                    logger.debug('Prev album: already on the first album in queue');
                    return;
                }

                const firstTrack = items.find(i => i.parentRatingKey === prevItem.parentRatingKey);
                if (!firstTrack) return;

                await plexConnection.playerCommand(
                    '/player/playback/skipTo',
                    { key: firstTrack.key, playQueueItemID: firstTrack.playQueueItemID }
                );
                logger.info(`Skipped to previous album (playQueueItemID: ${firstTrack.playQueueItemID})`);
            } catch (error) {
                logger.error(`Failed to skip to previous album: ${error.message}`);
            }
        }

        /**
         * Start playing an audio playlist by its ratingKey.
         * Creates a server-side playQueue then issues a playMedia command to the player.
         *
         * @param {string} ratingKey - Plex ratingKey of the playlist
         * @param {boolean} [shuffle=false] - Whether to shuffle the playlist
         */
        async playPlaylist(ratingKey, shuffle = false) {
            if (!ratingKey) {
                logger.warn('playPlaylist called with no ratingKey');
                return;
            }

            try {
                // Step 1: create a playQueue on the server
                const playQueueID = await plexConnection.createPlayQueue(ratingKey, shuffle);
                const serverMachineId = await plexConnection.fetchServerMachineId();

                // Derive address + port from serverUrl, e.g. http://192.168.1.100:32400
                const serverUrl = new URL(plexConnection.serverUrl);
                const address = serverUrl.hostname;
                const port = serverUrl.port || '32400';
                const protocol = serverUrl.protocol.replace(':', '') || 'http';

                // Step 2: instruct the player to play the queue.
                // Use a 10-second timeout — playMedia requires Plexamp to fetch the queue
                // from the server before responding, which takes longer than simple commands.
                await plexConnection.playerCommand('/player/playback/playMedia', {
                    key: `/playlists/${ratingKey}/items`,
                    containerKey: `/playQueues/${playQueueID}`,
                    machineIdentifier: serverMachineId,
                    address,
                    port,
                    protocol,
                    token: plexConnection.token
                }, 10000);

                logger.info(`Playing playlist ${ratingKey} via queue ${playQueueID}`);
            } catch (error) {
                logger.error(`Failed to play playlist: ${error.message}`);
            }
        }
    }

    // Singleton instance
    const playbackController = new PlaybackController();

    /**
     * Metadata Cache
     * Handles metadata loading and rating cache management
     */


    class MetadataCache {
        /**
         * Update track with timeline data
         */
        updateFromTimeline(timelineData) {
            if (!timelineData) {
                return;
            }

            // Update playback state
            state.playbackState = timelineData.state || 'stopped';
            state.updatePosition(
                timelineData.time || 0,
                Date.now()
            );
            state.trackDuration = timelineData.duration || 0;
            // Only accept volume from timeline if:
            //   1. No recent local setVolume command (avoids race condition), AND
            //   2. We are not in a muted/faded state — while muted the timeline will
            //      eventually report the pre-mute volume from Plexamp, which would
            //      visually reset the volume-button fill to the old level.
            const timeSinceVolumeCommand = Date.now() - state.lastVolumeCommandTime;
            if (timeSinceVolumeCommand > 2000 && state.muteRestoreVolume === null) {
                state.currentVolume = timelineData.volume ?? 50;
            }
            state.currentShuffle = timelineData.shuffle || 0;
            state.currentRepeat = timelineData.repeat || 0;

            // If no track or track changed, update
            if (!state.currentTrack || 
                state.currentTrack.ratingKey !== timelineData.ratingKey) {
                
                this.loadTrackData(timelineData);
            }
        }

        /**
         * Load full track data
         */
        async loadTrackData(timelineData) {
            if (!timelineData.ratingKey) {
                return;
            }

            // Store containerKey so skip-album can locate the current playQueue
            state.currentContainerKey = timelineData.containerKey || null;

            try {
                const metadata = await plexConnection.fetchMetadata(timelineData.ratingKey);
                
                if (!metadata) {
                    return;
                }

                // Update track in state
                state.updateTrack({
                    ...metadata,
                    Player: {
                        machineIdentifier: timelineData.machineIdentifier
                    }
                });

                // Handle rating with cache
                const incomingRating = metadata.userRating || 0;
                const cachedRating = state.getUserRating(metadata.ratingKey);

                if (cachedRating !== undefined && incomingRating === cachedRating) {
                    // Plex has caught up, clear cache
                    state.clearUserRating(metadata.ratingKey);
                    state.currentRating = incomingRating;
                    logger.debug(`Rating cache cleared for ${metadata.ratingKey}`);
                } else if (cachedRating !== undefined) {
                    // Still waiting for Plex to update, use cached value
                    state.currentRating = cachedRating;
                    logger.debug(`Using cached rating: ${cachedRating}`);
                } else {
                    // No override, use server value
                    state.currentRating = incomingRating;
                    logger.debug(`Rating from metadata: ${incomingRating}`);
                }

                // Determine what needs fetching
                const artPath = metadata.thumb || metadata.parentThumb || metadata.grandparentThumb;
                const artChanged = artPath && artPath !== state.lastArtPath;
                if (artChanged) state.lastArtPath = artPath;

                const albumChanged = metadata.parentRatingKey &&
                    metadata.parentRatingKey !== state.lastParentRatingKey;
                if (albumChanged) state.lastParentRatingKey = metadata.parentRatingKey;

                const inPlayQueue = timelineData.containerKey?.startsWith('/playQueues/');
                if (!inPlayQueue) {
                    state.queuePosition = null;
                    state.queueTotal = null;
                    state.playQueueIsPlaylist = false;
                }

                // Run art, track count, and queue fetches in parallel — previously sequential
                const [, countResult, queueResult] = await Promise.allSettled([
                    artChanged ? this.loadAlbumArt(artPath) : Promise.resolve(),
                    albumChanged ? plexConnection.fetchAlbumTrackCount(metadata.parentRatingKey) : Promise.resolve(null),
                    inPlayQueue ? plexConnection.fetchPlayQueue(timelineData.containerKey) : Promise.resolve(null)
                ]);

                if (countResult.status === 'fulfilled' && countResult.value !== null) {
                    state.albumTrackCount = countResult.value;
                }

                if (queueResult.status === 'fulfilled' && queueResult.value !== null) {
                    state.queuePosition = queueResult.value?.position ?? null;
                    state.queueTotal = queueResult.value?.total ?? null;
                    state.playQueueIsPlaylist = queueResult.value?.isPlaylistQueue ?? false;
                }

            } catch (error) {
                logger.error(`Failed to load track data: ${error.message}`);
            }
        }

        /**
         * Load album art and extract dominant color
         */
        async loadAlbumArt(thumbPath, serverInfo = null) {
            try {
                const dataUrl = await plexConnection.fetchAlbumArt(
                    thumbPath,
                    serverInfo?.serverUrl,
                    serverInfo?.token
                );
                
                state.currentAlbumArt = dataUrl;
                
                // Extract dominant color
                const color = await this.extractDominantColor(dataUrl);
                state.dominantColor = color;
                
                logger.debug(`Album art loaded, dominant color: ${color}`);
            } catch (error) {
                logger.error(`Failed to load album art: ${error.message}`);
            }
        }

        /**
         * Extract dominant color from image
         */
        async extractDominantColor(imageDataUrl) {
            return new Promise((resolve) => {
                const img = new Image();
                
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = 50;
                        canvas.height = 50;
                        ctx.drawImage(img, 0, 0, 50, 50);
                        
                        const pixels = ctx.getImageData(0, 0, 50, 50).data;
                        let r = 0, g = 0, b = 0, count = 0;
                        
                        // Sample pixels, skip too dark/bright, require saturation
                        for (let i = 0; i < pixels.length; i += 4) {
                            const pr = pixels[i];
                            const pg = pixels[i + 1];
                            const pb = pixels[i + 2];
                            const brightness = (pr + pg + pb) / 3;
                            
                            if (brightness > 30 && brightness < 220) {
                                const max = Math.max(pr, pg, pb);
                                const min = Math.min(pr, pg, pb);
                                if (max > 0 && (max - min) / max > 0.2) {
                                    r += pr;
                                    g += pg;
                                    b += pb;
                                    count++;
                                }
                            }
                        }
                        
                        if (count > 0) {
                            r = Math.round(r / count);
                            g = Math.round(g / count);
                            b = Math.round(b / count);
                            
                            // Boost saturation
                            const mn = Math.min(r, g, b);
                            r = Math.min(255, Math.round(r + (r - mn) * 0.2));
                            g = Math.min(255, Math.round(g + (g - mn) * 0.2));
                            b = Math.min(255, Math.round(b + (b - mn) * 0.2));
                            
                            const hex = '#' + 
                                r.toString(16).padStart(2, '0') +
                                g.toString(16).padStart(2, '0') +
                                b.toString(16).padStart(2, '0');
                            resolve(hex);
                        } else {
                            resolve('#E5A00D');
                        }
                    // eslint-disable-next-line no-unused-vars
                    } catch (e) {
                        resolve('#E5A00D');
                    }
                };
                
                img.onerror = () => resolve('#E5A00D');
                img.src = imageDataUrl;
            });
        }

        /**
         * Handle no active session
         */
        handleNoSession() {
            if (state.currentTrack !== null || state.playbackState !== 'stopped') {
                state.clearTrack();
                logger.debug('Session ended, state cleared');
            }
        }
    }

    // Singleton instance
    const metadataCache = new MetadataCache();

    /**
     * Button Renderer
     * Canvas-based rendering for Stream Deck buttons
     */


    /**
     * Get configured text color
     */
    function getTextColor$1() {
        return state.getGlobalSetting('textColor') || COLORS.WHITE;
    }

    /**
     * Get accent color (uses dominant color if dynamic colors enabled)
     */
    function getAccentColor$1() {
        const dynamicColors = state.getGlobalSetting('dynamicColors');
        return (dynamicColors === undefined || dynamicColors) 
            ? state.dominantColor 
            : COLORS.DEFAULT;
    }

    /**
     * Create canvas with standard size
     */
    function createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS.BUTTON_SIZE;
        canvas.height = CANVAS.BUTTON_SIZE;
        return canvas;
    }

    /**
     * Render album art button
     */
    function renderAlbumArt(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';

        if (state.currentAlbumArt) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);
                
                // Apply gray overlay when paused or stopped
                if (isDimmed) {
                    ctx.fillStyle = 'rgba(128, 128, 128, 0.6)';
                    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);
                }
                
                sendImage(context, canvas.toDataURL('image/png'));
            };
            img.src = state.currentAlbumArt;
        } else {
            // Show placeholder
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.textAlign = 'center';
            ctx.font = '16px sans-serif';
            ctx.fillText('No Album', 72, 76);
            sendImage(context, canvas.toDataURL('image/png'));
        }
    }

    /**
     * Render play/pause button.
     *
     * Draws the play triangle when paused/stopped, or two pause bars when playing.
     * Follows the same dimming logic as all other buttons.
     *
     * Play triangle:  (50,42) → (110,72) tip → (50,102)
     * Pause bars:     left x:45–63 y:42–102   right x:81–99 y:42–102
     *
     * @param {string} context - Stream Deck button context
     */
    function renderPlayPause(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';
        ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        const settings = state.getActionSettings(context) || {};
        const iconSize = parseInt(settings.playPauseIconSize) || 60;
        const half = iconSize / 2;
        const cx = CANVAS.BUTTON_SIZE / 2;
        const cy = CANVAS.BUTTON_SIZE / 2;
        const top = cy - half;

        if (state.playbackState === 'playing') {
            // Two pause bars, proportional to iconSize
            const barWidth = Math.round(iconSize * 0.3);
            const barGap   = Math.round(iconSize * 0.3);
            const leftX    = Math.round(cx - barWidth - barGap / 2);
            const rightX   = Math.round(cx + barGap / 2);
            ctx.fillRect(leftX,  top, barWidth, iconSize);
            ctx.fillRect(rightX, top, barWidth, iconSize);
        } else {
            // Play triangle, centered
            ctx.beginPath();
            ctx.moveTo(cx - half, top);
            ctx.lineTo(cx + half, cy);
            ctx.lineTo(cx - half, top + iconSize);
            ctx.closePath();
            ctx.fill();
        }

        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render info button (codec + track number)
     */
    function renderInfo(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';
        const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        if (state.currentTrack) {
            const media = state.currentTrack.Media?.[0];
            const format = media?.audioCodec ? media.audioCodec.toUpperCase() : '---';
            const bitrate = media?.bitrate ? `${Math.round(media.bitrate)} kbps` : '';
            const isInQueue = state.queuePosition !== null && state.queueTotal !== null;
            // Determined at queue load time by checking if the play queue spans multiple albums.
            // Album queues: show the track's own index (matches what Plexamp shows, shuffle-safe).
            // Playlist queues: show queue position (the track's rank in the playlist).
            const trackNum = (isInQueue && state.playQueueIsPlaylist) ? state.queuePosition : (state.currentTrack.index || '?');
            const totalTracks = (isInQueue && state.playQueueIsPlaylist) ? state.queueTotal : (state.albumTrackCount || '?');
            const trackStr = `${trackNum}/${totalTracks}`;

            // Symmetrical spacing: format, bitrate, label, track number
            const formatSize = 36;
            const bitrateSize = 26;
            const labelSize = 24;
            const maxTrackSize = 42;
            const minTrackSize = 16;
            const maxWidth = CANVAS.BUTTON_SIZE - 14; // 7px padding each side

            // Auto-shrink track number font to fit the button width
            let trackSize = maxTrackSize;
            ctx.font = `bold ${trackSize}px sans-serif`;
            while (ctx.measureText(trackStr).width > maxWidth && trackSize > minTrackSize) {
                trackSize--;
                ctx.font = `bold ${trackSize}px sans-serif`;
            }

            const totalContent = formatSize + bitrateSize + labelSize + trackSize;
            const gap = (CANVAS.BUTTON_SIZE - totalContent) / 5;
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Audio format (e.g., FLAC, MP3)
            ctx.font = `bold ${formatSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.fillText(format, 72, gap + formatSize / 2);

            // Bitrate
            ctx.font = `bold ${bitrateSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText(bitrate, 72, gap + formatSize + gap + bitrateSize / 2);

            // "TRACK" label
            ctx.font = `bold ${labelSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.fillText('TRACK', 72, gap + formatSize + gap + bitrateSize + gap + labelSize / 2);

            // Track number (e.g., 3/12 or 1234/10000)
            ctx.font = `bold ${trackSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText(trackStr, 72, gap + formatSize + gap + bitrateSize + gap + labelSize + gap + trackSize / 2);
        } else {
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '16px sans-serif';
            ctx.fillText('No Track', 72, 72);
        }
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render time button (position / duration)
     */
    function renderTime(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';
        const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        // Symmetrical spacing: current time, duration, progress bar
        const timeSize = 42;
        const durationSize = 40;
        const progressHeight = 10;
        const totalContent = timeSize + durationSize + progressHeight;
        const gap = (CANVAS.BUTTON_SIZE - totalContent) / 4;
        
        const timeY = gap + timeSize / 2;
        const durationY = gap + timeSize + gap + durationSize / 2;
        const progressY = gap + timeSize + gap + durationSize + gap;

        if (state.playbackState === 'stopped') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${timeSize}px sans-serif`;
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.fillText('0:00', 72, timeY);
            ctx.font = `bold ${durationSize}px sans-serif`;
            ctx.fillText('/ 0:00', 72, durationY);
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.fillRect(15, progressY, 114, progressHeight);
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Check display mode
            const displayMode = state.getTimeDisplayMode(context);
            
            if (displayMode === 'remaining') {
                // Show elapsed / -remaining
                const remaining = state.trackDuration - state.currentPosition;
                ctx.font = `bold ${timeSize}px sans-serif`;
                ctx.fillStyle = textColor;
                ctx.fillText(formatTime(state.currentPosition), 72, timeY);

                // Remaining time with minus sign
                ctx.font = `bold ${durationSize}px sans-serif`;
                ctx.fillStyle = accentColor;
                ctx.fillText('/ -' + formatTime(remaining), 72, durationY);
            } else {
                // Show elapsed / total (default)
                ctx.font = `bold ${timeSize}px sans-serif`;
                ctx.fillStyle = textColor;
                ctx.fillText(formatTime(state.currentPosition), 72, timeY);

                // Total duration
                ctx.font = `bold ${durationSize}px sans-serif`;
                ctx.fillStyle = accentColor;
                ctx.fillText('/ ' + formatTime(state.trackDuration), 72, durationY);
            }

            // Progress bar background
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.fillRect(15, progressY, 114, progressHeight);

            // Progress bar fill
            if (state.trackDuration > 0) {
                const progress = state.displayProgress / 100;
                const fillWidth = Math.round(114 * progress);
                ctx.fillStyle = accentColor;
                ctx.fillRect(15, progressY, fillWidth, progressHeight);
            }
        }
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render rating button
     */
    function renderRating(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const settings = state.getActionSettings(context) || {};
        const fontSize = parseInt(settings.ratingFontSize) || 48;
        const ratingMode = settings.ratingMode || "half";
        const displayStyle = settings.ratingDisplay || "stars";
        
        const isDimmed = state.playbackState === 'stopped';
        const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        const showRatingLabel = settings.showRatingLabel !== false; // default true

        if (state.currentTrack) {
            if (ratingMode === 'single') {
                // Single-star mode: optional "RATING" label, large centered star below
                // 3 states matching Plexamp: empty ☆ (unrated) → ★ (liked=10) → ★̶ (disliked=2)
                ctx.textAlign = 'center';

                let starCenterY;
                if (showRatingLabel) {
                    ctx.font = 'bold 26px sans-serif';
                    ctx.fillStyle = textColor;
                    ctx.fillText('RATING', 72, 32);
                    starCenterY = Math.round((40 + CANVAS.BUTTON_SIZE) / 2); // ≈92
                } else {
                    starCenterY = Math.round(CANVAS.BUTTON_SIZE / 2); // 72 — fully centered
                }

                ctx.textBaseline = 'middle';
                ctx.font = `bold ${fontSize}px sans-serif`;
                const scale = fontSize / 90;

                if (state.currentRating === RATING.SINGLE_LIKED) {
                    // Liked: full ★ in accent color
                    ctx.fillStyle = accentColor;
                    ctx.fillText('★', 72, starCenterY);
                } else if (state.currentRating === RATING.SINGLE_DISLIKED) {
                    // Disliked: full ★ with diagonal "/" strikethrough in accent color
                    ctx.fillStyle = accentColor;
                    ctx.fillText('★', 72, starCenterY);
                    ctx.strokeStyle = accentColor;
                    ctx.lineWidth = Math.max(2, Math.round(8 * scale));
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(72 - Math.round(34 * scale), starCenterY + Math.round(38 * scale));
                    ctx.lineTo(72 + Math.round(36 * scale), starCenterY - Math.round(42 * scale));
                    ctx.stroke();
                } else {
                    // Unrated: empty ☆ in text color
                    ctx.fillStyle = textColor;
                    ctx.fillText('☆', 72, starCenterY);
                }
            } else {
            // Conditionally display "RATING" label at top
            ctx.textAlign = "center";
            let contentY;
            if (showRatingLabel) {
                ctx.font = "bold 26px sans-serif";
                ctx.fillStyle = textColor;
                ctx.fillText("RATING", 72, 32);
                contentY = 90;
            } else {
                contentY = Math.round(CANVAS.BUTTON_SIZE / 2); // 72 — fully centered
            }

            // Display rating based on style preference
            const hasHalfStar = state.currentRating % 2 === 1;
            let numericRating;
            
            if (displayStyle === "stars") {
                // Stars only
                const stars = formatRating(state.currentRating, ratingMode);
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = accentColor;
                ctx.fillText(stars, 72, contentY);
            } else if (displayStyle === "numeric") {
                // Numeric only (e.g., "4.5" or "4")
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = accentColor;
                if (state.currentRating === 0) {
                    ctx.fillText("0", 72, contentY);
                } else {
                    numericRating = hasHalfStar ? (state.currentRating / 2).toFixed(1) : (state.currentRating / 2).toString();
                    ctx.fillText(numericRating, 72, contentY);
                }
            } else {
                // Both - numeric with scale (e.g., "4.5/5" or "4/5")
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = accentColor;
                if (state.currentRating === 0) {
                    ctx.fillText("0/5", 72, contentY);
                } else {
                    numericRating = hasHalfStar ? (state.currentRating / 2).toFixed(1) : (state.currentRating / 2).toString();
                    ctx.fillText(numericRating + "/5", 72, contentY);
                }
            }
            } // end non-single block
        } else {
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.textAlign = "center";
            ctx.font = "16px sans-serif";
            ctx.fillText("No Track", 72, 76);
        }
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render shuffle button
     */
    function renderShuffle(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();
        const isOn = state.currentShuffle === 1;
        const settings = state.getActionSettings(context) || {};
        const accentOff = settings.shuffleAccentOff === true;
        const iconColor = isDimmed ? COLORS.DARK_GRAY : (isOn || accentOff ? accentColor : COLORS.DARK_GRAY);

        // Crossing arrows
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(30, 52);
        ctx.lineTo(65, 52);
        ctx.lineTo(85, 86);
        ctx.lineTo(110, 86);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(30, 86);
        ctx.lineTo(65, 86);
        ctx.lineTo(85, 52);
        ctx.lineTo(110, 52);
        ctx.stroke();

        // Arrowheads
        ctx.fillStyle = iconColor;
        ctx.beginPath();
        ctx.moveTo(105, 41);
        ctx.lineTo(120, 52);
        ctx.lineTo(105, 63);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(105, 75);
        ctx.lineTo(120, 86);
        ctx.lineTo(105, 97);
        ctx.closePath();
        ctx.fill();

        // State label - always shown, white text
        ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : COLORS.WHITE;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isOn ? 'ON' : 'OFF', 72, 130);
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render repeat button
     */
    function renderRepeat(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const isDimmed = state.playbackState === 'stopped';
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();
        const isOn = state.currentRepeat > 0;
        const settings = state.getActionSettings(context) || {};
        const accentOff = settings.repeatAccentOff === true;
        const iconColor = isDimmed ? COLORS.DARK_GRAY : (isOn || accentOff ? accentColor : COLORS.DARK_GRAY);

        // Loop shape
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = 6;

        ctx.beginPath();
        ctx.moveTo(35, 48);
        ctx.lineTo(105, 48);
        ctx.quadraticCurveTo(118, 48, 118, 61);
        ctx.lineTo(118, 75);
        ctx.quadraticCurveTo(118, 88, 105, 88);
        ctx.lineTo(35, 88);
        ctx.quadraticCurveTo(22, 88, 22, 75);
        ctx.lineTo(22, 61);
        ctx.quadraticCurveTo(22, 48, 35, 48);
        ctx.stroke();

        // Arrow
        ctx.fillStyle = iconColor;
        ctx.beginPath();
        ctx.moveTo(95, 33);
        ctx.lineTo(115, 48);
        ctx.lineTo(95, 63);
        ctx.closePath();
        ctx.fill();

        // "1" badge inside loop for repeat-one
        if (state.currentRepeat === 1) {
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('1', 70, 78);
        }

        // State label - always shown, white text
        // Plex API: 1=One, 2=All
        const labelText = state.currentRepeat === 2 ? 'ALL' : state.currentRepeat === 1 ? 'ONE' : 'OFF';
        ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : COLORS.WHITE;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, 72, 128);
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render previous button (double left arrows)
     */
    function renderPrevious(context, animationFrame = null) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const settings = state.getActionSettings(context) || {};
        const iconSize = parseInt(settings.navigationIconSize) || 60;
        const isDimmed = state.playbackState === 'stopped';
        const iconColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        // Calculate animation offset (starts at center, moves left, wraps from right)
        let offsetX = 0;
        if (animationFrame !== null) {
            const speed = 30; // pixels per frame (adjusted for 500ms interval)
            const wrapRange = (CANVAS.BUTTON_SIZE + iconSize) * 2; // full cycle range
            const traveled = animationFrame * speed;
            const shifted = traveled + wrapRange / 2; // shift cycle to start at center
            const cyclePos = shifted % wrapRange;
            offsetX = (wrapRange / 2) - cyclePos; // moves left, wraps from right
        }

        // Calculate centered position with animation
        const centerX = (CANVAS.BUTTON_SIZE / 2) + offsetX;
        const centerY = CANVAS.BUTTON_SIZE / 2;
        const halfSize = iconSize / 2;
        const triangleWidth = iconSize * 0.6;
        const gap = iconSize * 0.1;
        
        // Helper function to draw left-pointing triangles
        const drawTriangles = (x) => {
            // Left triangle
            ctx.beginPath();
            ctx.moveTo(x - gap - triangleWidth, centerY);  // Left point
            ctx.lineTo(x - gap, centerY - halfSize);       // Top right
            ctx.lineTo(x - gap, centerY + halfSize);       // Bottom right
            ctx.closePath();
            ctx.fill();
            
            // Right triangle
            ctx.beginPath();
            ctx.moveTo(x + gap, centerY);                   // Left point
            ctx.lineTo(x + gap + triangleWidth, centerY - halfSize);  // Top right
            ctx.lineTo(x + gap + triangleWidth, centerY + halfSize);  // Bottom right
            ctx.closePath();
            ctx.fill();
        };
        
        // Draw double left-pointing triangles
        ctx.fillStyle = iconColor;
        
        // Draw at current position
        drawTriangles(centerX);
        
        // Draw wrapped copy if near edges (for seamless Pac-Man effect)
        const iconWidth = triangleWidth * 2 + gap * 2;
        if (centerX - iconWidth / 2 < 0) {
            // Exiting left edge, draw wrapped from right
            drawTriangles(centerX + CANVAS.BUTTON_SIZE);
        } else if (centerX + iconWidth / 2 > CANVAS.BUTTON_SIZE) {
            // Exiting right edge, draw wrapped from left
            drawTriangles(centerX - CANVAS.BUTTON_SIZE);
        }
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render next button (double right arrows)
     */
    function renderNext(context, animationFrame = null) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const settings = state.getActionSettings(context) || {};
        const iconSize = parseInt(settings.navigationIconSize) || 60;
        const isDimmed = state.playbackState === 'stopped';
        const iconColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        // Calculate animation offset (starts at center, moves right, wraps from left)
        let offsetX = 0;
        if (animationFrame !== null) {
            const speed = 30; // pixels per frame (adjusted for 500ms interval)
            const wrapRange = (CANVAS.BUTTON_SIZE + iconSize) * 2; // full cycle range
            const traveled = animationFrame * speed;
            const shifted = traveled + wrapRange / 2; // shift cycle to start at center
            const cyclePos = shifted % wrapRange;
            offsetX = cyclePos - (wrapRange / 2); // moves right, wraps from left
        }

        // Calculate centered position with animation
        const centerX = (CANVAS.BUTTON_SIZE / 2) + offsetX;
        const centerY = CANVAS.BUTTON_SIZE / 2;
        const halfSize = iconSize / 2;
        const triangleWidth = iconSize * 0.6;
        const gap = iconSize * 0.1;

        // Helper function to draw right-pointing triangles
        const drawTriangles = (x) => {
            // Left triangle
            ctx.beginPath();
            ctx.moveTo(x - gap, centerY);                          // Right point
            ctx.lineTo(x - gap - triangleWidth, centerY - halfSize);  // Top left
            ctx.lineTo(x - gap - triangleWidth, centerY + halfSize);  // Bottom left
            ctx.closePath();
            ctx.fill();
            
            // Right triangle
            ctx.beginPath();
            ctx.moveTo(x + gap + triangleWidth, centerY);         // Right point
            ctx.lineTo(x + gap, centerY - halfSize);              // Top left
            ctx.lineTo(x + gap, centerY + halfSize);              // Bottom left
            ctx.closePath();
            ctx.fill();
        };

        // Draw double right-pointing triangles
        ctx.fillStyle = iconColor;
        
        // Draw at current position
        drawTriangles(centerX);
        
        // Draw wrapped copy if near edges (for seamless Pac-Man effect)
        const iconWidth = triangleWidth * 2 + gap * 2;
        if (centerX - iconWidth / 2 < 0) {
            // Exiting left edge, draw wrapped from right
            drawTriangles(centerX + CANVAS.BUTTON_SIZE);
        } else if (centerX + iconWidth / 2 > CANVAS.BUTTON_SIZE) {
            // Exiting right edge, draw wrapped from left
            drawTriangles(centerX - CANVAS.BUTTON_SIZE);
        }
        
        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render volume up button
     */
    function renderVolumeUp(context) {
        renderVolumeButton(context, 'up');
    }

    /**
     * Render volume down button
     */
    function renderVolumeDown(context) {
        renderVolumeButton(context, 'down');
    }

    /**
     * Shared volume button renderer
     * Draws a speaker + waves icon with a +/- badge.
     * The icon is filled from bottom with accent color proportional to current volume.
     *
     * @param {string} context - Stream Deck button context
     * @param {'up'|'down'} direction - Which button variant to draw
     */
    function renderVolumeButton(context, direction) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        const S = CANVAS.BUTTON_SIZE; // 144

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, S, S);

        const isDimmed = state.playbackState === 'stopped';
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();
        const volume = Math.max(0, Math.min(100, state.currentVolume ?? 50));

        // ── Speaker geometry ───────────────────────────────────────────
        // Box (rectangle on left): x 18-40, y 54-90
        // Cone (trapezoid flaring right): base at x=40 (y 54-90), tip at x=64 (y 34-110)
        const bL = 18, bR = 40, bT = 54, bB = 90;   // box
        const cR = 64, cT = 34, cB = 110;            // cone right-edge x, top y, bottom y

        // Two wave arcs to the right of the cone, centered on speaker midline
        const wCX = 58, wCY = 72;
        const waveData = [
            { r: 18, a0: -0.7, a1: 0.7 },
            { r: 34, a0: -0.7, a1: 0.7 }
        ];

        // +/- badge: top-right corner, centered at (112, 32)
        const bX = 112, bY = 32, bArm = 11;

        // Icon vertical bounds for fill calculation — must cover badge top (bY - bArm) too
        const iconTop = bY - bArm;  // 21 — top of the +/- badge arms
        const iconBottom = cB;      // 110

        // ── Draw helpers ───────────────────────────────────────────────
        const drawSpeaker = () => {
            ctx.beginPath();
            ctx.moveTo(bL, bT);           // box top-left
            ctx.lineTo(bR, bT);           // box top-right
            ctx.lineTo(cR, cT);           // cone upper tip
            ctx.lineTo(cR, cB);           // cone lower tip
            ctx.lineTo(bR, bB);           // box bottom-right
            ctx.lineTo(bL, bB);           // box bottom-left
            ctx.closePath();
        };

        const drawWaves = () => {
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            for (const w of waveData) {
                ctx.beginPath();
                ctx.arc(wCX, wCY, w.r, w.a0, w.a1);
                ctx.stroke();
            }
        };

        const drawBadge = () => {
            ctx.lineWidth = 5.5;
            ctx.lineCap = 'round';
            // Horizontal bar (shared by + and -)
            ctx.beginPath();
            ctx.moveTo(bX - bArm, bY);
            ctx.lineTo(bX + bArm, bY);
            ctx.stroke();
            if (direction === 'up') {
                // Vertical bar to make +
                ctx.beginPath();
                ctx.moveTo(bX, bY - bArm);
                ctx.lineTo(bX, bY + bArm);
                ctx.stroke();
            }
        };

        // ── Step 1: full icon in dark gray (represents "empty") ────────
        ctx.fillStyle = COLORS.DARK_GRAY;
        drawSpeaker();
        ctx.fill();

        ctx.strokeStyle = COLORS.DARK_GRAY;
        drawWaves();
        drawBadge();

        // ── Step 2: clip to filled portion and redraw in accent color ──
        if (volume > 0) {
            const fillY = iconBottom - (volume / 100) * (iconBottom - iconTop);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, fillY, S, S - fillY);
            ctx.clip();

            ctx.fillStyle = accentColor;
            drawSpeaker();
            ctx.fill();

            ctx.strokeStyle = accentColor;
            drawWaves();
            drawBadge();

            ctx.restore();
        }

        // Show FADING label while a fade-out is in progress for this button
        if (direction === 'down' && state.activeFadeContext === context) {
            ctx.save();
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('FADING', S / 2, S - 6);
            ctx.restore();
        }

        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render playlist button.
     *
     * Empty (no playlist set): dot+bar list icon + "PLAYLIST" label.
     * Configured: large auto-sized name fills the button — no icon, easy to read.
     */
    function renderPlaylist(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        const S = CANVAS.BUTTON_SIZE; // 144

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, S, S);

        const isDimmed = state.playbackState === 'stopped';
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();
        const settings = state.getActionSettings(context) || {};
        const playlistName = settings.playlistName || null;

        // ── Empty state: icon + "PLAYLIST" label ──────────────────────
        if (!playlistName) {
            // Symmetrical layout: icon block + label, 3 equal gaps
            const iconH   = 46;
            const labelSz = 18;
            const gap = (S - (iconH + labelSz)) / 3;

            const iconTop = gap;
            const labelY  = gap + iconH + gap + labelSz / 2;

            // 3-row Plexamp dot+bar list icon
            const rows = 3;
            const rowH = iconH / rows;
            const dotR = 4;
            const dotX = 28;
            const barX0 = dotX + dotR + 8;
            const barX1 = 116;

            ctx.fillStyle   = COLORS.MEDIUM_GRAY;
            ctx.strokeStyle = COLORS.MEDIUM_GRAY;
            ctx.lineWidth   = 4;
            ctx.lineCap     = 'round';

            for (let i = 0; i < rows; i++) {
                const rowY = iconTop + (i + 0.5) * rowH;
                ctx.beginPath();
                ctx.arc(dotX, rowY, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(barX0, rowY);
                ctx.lineTo(barX1, rowY);
                ctx.stroke();
            }

            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.font         = `bold ${labelSz}px sans-serif`;
            ctx.fillStyle    = COLORS.MEDIUM_GRAY;
            ctx.fillText('PLAYLIST', S / 2, labelY);

            sendImage(context, canvas.toDataURL('image/png'));
            return;
        }

        // ── Configured state: single line if it fits, else smart 2-line wrap ──
        const maxW    = S - 16;  // 8px padding each side
        const maxFont = 36;
        const minFont = 14;
        const mw = t => ctx.measureText(t).width;

        // Step 1: full name fits on one line at max font — simplest case
        ctx.font = `bold ${maxFont}px sans-serif`;
        if (mw(playlistName) <= maxW) {
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = accentColor;
            ctx.fillText(playlistName, S / 2, S / 2);
            sendImage(context, canvas.toDataURL('image/png'));
            return;
        }

        // Step 2: try 2-line word-wrap — find largest font where any clean split exists,
        //         then pick the most balanced (equal-width) split at that font size
        const words = playlistName.split(' ');
        let bestFont = 0, bestLines = null;

        if (words.length >= 2) {
            for (let fs = maxFont; fs >= minFont; fs--) {
                ctx.font = `bold ${fs}px sans-serif`;
                let bestSplit = null, bestDiff = Infinity;
                for (let split = 1; split < words.length; split++) {
                    const l1 = words.slice(0, split).join(' ');
                    const l2 = words.slice(split).join(' ');
                    if (mw(l1) <= maxW && mw(l2) <= maxW) {
                        const diff = Math.abs(mw(l1) - mw(l2));
                        if (diff < bestDiff) { bestDiff = diff; bestSplit = split; }
                    }
                }
                if (bestSplit !== null) {
                    bestFont  = fs;
                    bestLines = [
                        words.slice(0, bestSplit).join(' '),
                        words.slice(bestSplit).join(' ')
                    ];
                    break;
                }
            }
        }

        if (bestLines) {
            const lineH  = bestFont * 1.25;
            const blockH = 2 * lineH;
            const startY = (S - blockH) / 2 + lineH / 2;

            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = accentColor;
            bestLines.forEach((line, i) => ctx.fillText(line, S / 2, startY + i * lineH));
            sendImage(context, canvas.toDataURL('image/png'));
            return;
        }

        // Step 3: last resort — single line shrunk + smart ellipsis (single long word, etc.)
        let fontSize = maxFont;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (fontSize > minFont && mw(playlistName) > maxW) {
            fontSize--;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }

        let displayText = playlistName;
        if (mw(displayText) > maxW) {
            // word-level: drop trailing words
            displayText = '';
            for (let i = words.length - 1; i >= 1; i--) {
                const candidate = words.slice(0, i).join(' ') + '\u2026';
                if (mw(candidate) <= maxW) { displayText = candidate; break; }
            }
            // char-level fallback
            if (!displayText) {
                displayText = playlistName;
                while (displayText.length > 1 && mw(displayText + '\u2026') > maxW) {
                    displayText = displayText.slice(0, -1);
                }
                displayText = displayText.trimEnd() + '\u2026';
            }
        }

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = accentColor;
        ctx.fillText(displayText, S / 2, S / 2);

        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render track title button.
     *
     * Layout (144×144, symmetrical gaps):
     *   "TITLE" label  — textColor, 22px bold (optional via settings)
     *   Track title    — accentColor, auto-sized 14–36px bold, 1-line or 2-line word-wrap
     */
    function renderTrackTitle(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        const S = CANVAS.BUTTON_SIZE; // 144

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, S, S);

        const settings = state.getActionSettings(context) || {};
        const showTitleLabel = settings.showTitleLabel !== false; // default to true

        const isDimmed    = state.playbackState === 'stopped';
        const textColor   = isDimmed ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        if (!state.currentTrack) {
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.font         = '16px sans-serif';
            // When Plexamp is unreachable (stopped): dark gray "No Track"
            // When Plexamp is running but idle: normal text color "Not Playing"
            ctx.fillStyle    = isDimmed ? COLORS.DARK_GRAY : getTextColor$1();
            ctx.fillText(isDimmed ? 'No Track' : 'Not Playing', S / 2, S / 2);
            sendImage(context, canvas.toDataURL('image/png'));
            return;
        }

        // "TITLE" label — optional, identical style to "RATING" / "TRACK" on sibling buttons
        if (showTitleLabel) {
            ctx.textAlign = 'center';
            ctx.font      = 'bold 26px sans-serif';
            ctx.fillStyle = textColor;
            ctx.fillText('TITLE', S / 2, 32); // alphabetic baseline at 32, matches Rating/Info
        }

        const title       = state.currentTrack.title || 'Unknown Title';
        const maxTitleFt  = 52;
        const minTitleFt  = 13;
        const lineSpacing = 1.25;
        const maxW        = S - 16; // 8px padding each side
        const words       = title.split(' ');

        // Content area depends on whether label is shown
        let contentCY, contentH;
        if (showTitleLabel) {
            // Content area sits below the label (label baseline 32 + ~8px descender gap = 40)
            // leaving 144 - 40 - 8 = 96px tall content zone, centred at y=92
            contentCY = 92;
            contentH  = 96;
        } else {
            // Use the full button space evenly, centred
            contentCY = S / 2;  // 72
            contentH  = S - 16; // 128 (8px padding top and bottom)
        }

        // ── Find largest font where title fits into contentH (1, 2, or 3 lines) ──
        let titleFont, titleLines, titleBlockH;

        for (let fs = maxTitleFt; fs >= minTitleFt; fs--) {
            ctx.font = `bold ${fs}px sans-serif`;
            const lineH = fs * lineSpacing;

            // Single line
            if (ctx.measureText(title).width <= maxW && fs <= contentH) {
                titleFont   = fs;
                titleLines  = [title];
                titleBlockH = fs;
                break;
            }

            // 2-line word-wrap
            if (words.length >= 2) {
                const blockH2 = lineH + fs;
                if (blockH2 <= contentH) {
                    let best2 = null, bestDiff = Infinity;
                    for (let s = 1; s < words.length; s++) {
                        const l1 = words.slice(0, s).join(' ');
                        const l2 = words.slice(s).join(' ');
                        if (ctx.measureText(l1).width <= maxW && ctx.measureText(l2).width <= maxW) {
                            const diff = Math.abs(ctx.measureText(l1).width - ctx.measureText(l2).width);
                            if (diff < bestDiff) { bestDiff = diff; best2 = s; }
                        }
                    }
                    if (best2 !== null) {
                        titleFont   = fs;
                        titleLines  = [words.slice(0, best2).join(' '), words.slice(best2).join(' ')];
                        titleBlockH = blockH2;
                        break;
                    }
                }
            }

            // 3-line word-wrap
            if (words.length >= 3) {
                const blockH3 = 2 * lineH + fs;
                if (blockH3 <= contentH) {
                    let best3 = null, bestDiff = Infinity;
                    for (let s1 = 1; s1 < words.length - 1; s1++) {
                        for (let s2 = s1 + 1; s2 < words.length; s2++) {
                            const l1 = words.slice(0, s1).join(' ');
                            const l2 = words.slice(s1, s2).join(' ');
                            const l3 = words.slice(s2).join(' ');
                            if (ctx.measureText(l1).width <= maxW &&
                                ctx.measureText(l2).width <= maxW &&
                                ctx.measureText(l3).width <= maxW) {
                                const widths = [l1, l2, l3].map(l => ctx.measureText(l).width);
                                const diff = Math.max(...widths) - Math.min(...widths);
                                if (diff < bestDiff) { bestDiff = diff; best3 = [s1, s2]; }
                            }
                        }
                    }
                    if (best3 !== null) {
                        const [s1, s2] = best3;
                        titleFont   = fs;
                        titleLines  = [
                            words.slice(0, s1).join(' '),
                            words.slice(s1, s2).join(' '),
                            words.slice(s2).join(' ')
                        ];
                        titleBlockH = blockH3;
                        break;
                    }
                }
            }
        }

        // Ellipsis fallback
        if (!titleFont) {
            titleFont = minTitleFt;
            ctx.font  = `bold ${minTitleFt}px sans-serif`;
            let display = title;
            while (display.length > 1 && ctx.measureText(display + '\u2026').width > maxW) {
                display = display.slice(0, -1);
            }
            titleLines  = [display.trimEnd() + '\u2026'];
            titleBlockH = minTitleFt;
        }

        // Draw title block centred in content area
        ctx.font      = `bold ${titleFont}px sans-serif`;
        ctx.fillStyle = accentColor;
        ctx.textAlign = 'center';
        if (titleLines.length === 1) {
            ctx.textBaseline = 'middle';
            ctx.fillText(titleLines[0], S / 2, contentCY);
        } else {
            ctx.textBaseline = 'top';
            const lineH       = titleFont * lineSpacing;
            const blockStartY = contentCY - titleBlockH / 2;
            titleLines.forEach((line, i) => ctx.fillText(line, S / 2, blockStartY + i * lineH));
        }

        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Shared album-skip button renderer.
     * direction: 'next' = triangle→bar (right), 'prev' = bar←triangle (left)
     */
    function renderAlbumSkip(context, direction) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        const S = CANVAS.BUTTON_SIZE; // 144

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, S, S);

        const settings  = state.getActionSettings(context) || {};
        const iconSize  = parseInt(settings.navigationIconSize) || 60;
        const isDimmed  = state.playbackState === 'stopped';
        ctx.fillStyle   = isDimmed ? COLORS.DARK_GRAY : getAccentColor$1();

        const cx    = S / 2;
        const cy    = S / 2;
        const halfH = iconSize / 2;
        const triW  = iconSize * 0.6;
        const gap   = iconSize * 0.1;
        const barW  = iconSize * 0.2;
        const totalW = triW + gap + barW;

        if (direction === 'next') {
            // Right-pointing triangle + bar on the right
            const startX = cx - totalW / 2;
            const tipX   = startX + triW;
            ctx.beginPath();
            ctx.moveTo(tipX, cy);
            ctx.lineTo(startX, cy - halfH);
            ctx.lineTo(startX, cy + halfH);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(tipX + gap, cy - halfH, barW, iconSize);
        } else {
            // Bar on the left + left-pointing triangle
            const startX  = cx - totalW / 2;
            const barEnd  = startX + barW;
            const triBase = barEnd + gap;
            ctx.fillRect(startX, cy - halfH, barW, iconSize);
            ctx.beginPath();
            ctx.moveTo(triBase, cy);
            ctx.lineTo(triBase + triW, cy - halfH);
            ctx.lineTo(triBase + triW, cy + halfH);
            ctx.closePath();
            ctx.fill();
        }

        sendImage(context, canvas.toDataURL('image/png'));
    }

    /**
     * Render next-album button
     */
    function renderSkipAlbum(context) {
        renderAlbumSkip(context, 'next');
    }

    /**
     * Render previous-album button
     */
    function renderPrevAlbum(context) {
        renderAlbumSkip(context, 'prev');
    }

    /**
     * Send image to Stream Deck
     */
    function sendImage(context, dataUrl) {
        if (state.connection && state.connection.isConnected()) {
            state.connection.send({
                event: 'setImage',
                context: context,
                payload: { image: dataUrl, target: 0 }
            });
        }
    }

    var buttonRenderer = {
        renderAlbumArt,
        renderPlayPause,
        renderPrevious,
        renderNext,
        renderInfo,
        renderTime,
        renderRating,
        renderShuffle,
        renderRepeat,
        renderVolumeUp,
        renderVolumeDown,
        renderPlaylist,
        renderTrackTitle,
        renderSkipAlbum,
        renderPrevAlbum
    };

    /**
     * Layout Manager
     * Handles touch strip layouts, scrolling text, and feedback
     */


    // Cache of poster art dataUrls keyed by playlist ratingKey
    const posterCache = new Map();

    /**
     * Get text color
     */
    function getTextColor() {
        return state.getGlobalSetting('textColor') || COLORS.WHITE;
    }

    /**
     * Get accent color
     */
    function getAccentColor() {
        const dynamicColors = state.getGlobalSetting('dynamicColors');
        return (dynamicColors === undefined || dynamicColors) 
            ? state.dominantColor 
            : COLORS.DEFAULT;
    }

    /**
     * Get secondary color based on text color
     */
    function getSecondaryColor(textColor) {
        const colorMap = {
            [COLORS.WHITE]: '#999999',
            '#BBBBBB': '#777777',
            [COLORS.DEFAULT]: '#B07A0A',
            '#FFBF00': '#B08600',
            [COLORS.BLACK]: '#444444'
        };
        return colorMap[textColor] || '#999999';
    }

    /**
     * Render touch strip layout
     */
    function renderStripLayout(context) {
        // Never overwrite an active overlay regardless of caller
        if (state.getStripOverlay(context)) return;

        const settings = state.getActionSettings(context);
        const displayMode = state.getActiveDisplayMode(context) || settings.displayMode || 'artist';
        const fontSize = parseInt(settings.fontSize) || 16;
        const totalPanels = parseInt(settings.progressTotalPanels) || 3;
        const position = parseInt(settings.progressPosition) || 1;

        const textColor = getTextColor();
        const accentColor = getAccentColor();
        const stripSecondary = getSecondaryColor(textColor);
        const isDimmed = state.playbackState === 'stopped';
        const effectiveAccent  = isDimmed ? stripSecondary : accentColor;

        let label = '', text = '';
        if (displayMode === 'playlists') {
            return renderPlaylistCarousel(context, settings, fontSize, totalPanels, position, textColor, accentColor, stripSecondary);
        } else if (displayMode === 'queue') {
            return renderQueueBrowser(context, settings, accentColor, textColor, stripSecondary, settings.queuePressAction || 'remove');
        } else if (state.currentTrack) {
            if (displayMode === 'artist') {
                label = 'ARTIST';
                text = state.currentTrack.grandparentTitle || 'Unknown';
            } else if (displayMode === 'album') {
                label = 'ALBUM';
                text = state.currentTrack.parentTitle || 'Unknown';
            } else if (displayMode === 'track') {
                label = 'TRACK';
                text = state.currentTrack.title || 'Unknown';
            } else if (displayMode === 'time') {
                label = 'TIME';
                text = `${formatTime(state.currentPosition)} / ${formatTime(state.trackDuration)}`;
            }
        } else {
            label = displayMode.toUpperCase();
            text = displayMode === 'time' ? '0:00 / 0:00' : 'Not Playing';
        }

        const labelSize = Math.max(14, Math.round(fontSize * 0.85));
        const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, effectiveAccent);

        const showLabel = settings.showStripLabel !== false; // default true
        const labelColor = isDimmed ? stripSecondary : textColor;
        const textDisplayColor = isDimmed ? stripSecondary : textColor;

        // Always use pixmap for displayText for consistent rendering
        const textAreaH = fontSize + 8;
        const labelHeight = labelSize + 4;
        const progressBarHeight = 10;

        // Pin progress bar a few pixels from the bottom
        const progressY = 90;
        let labelY, textY;
        if (showLabel) {
            // 3 equal gaps: above label, between label & text, between text & bar
            const gap = (progressY - labelHeight - textAreaH) / 3;
            labelY = gap;
            textY = gap + labelHeight + gap;
        } else {
            textY = (progressY - textAreaH) / 2;
        }

        const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}|${showLabel}`;

        if (state.lastLayoutState[context] !== layoutKey) {
            state.lastLayoutState[context] = layoutKey;
            const items = [];
            if (showLabel) {
                items.push({
                    key: 'label',
                    type: 'text',
                    rect: [0, labelY, 200, labelHeight],
                    font: { size: labelSize, weight: 700 },
                    color: labelColor,
                    alignment: 'center'
                });
            }
            items.push(
                {
                    key: 'displayText',
                    type: 'pixmap',
                    rect: [0, textY, 200, textAreaH]
                },
                {
                    key: 'progressBar',
                    type: 'pixmap',
                    rect: [0, progressY, 200, progressBarHeight]
                }
            );
            setFeedbackLayout(context, {
                id: 'com.dreadheadhippy.ampdeckplus.layout',
                items: items
            });
        }

        // Check if text needs scrolling
        const font = `${fontSize}px sans-serif`;
        const needsScroll = measureTextWidth(text, font) > 190;

        let textImage;
        if (needsScroll) {
            textImage = renderScrollingText(context, text, fontSize, textDisplayColor);
        } else {
            if (state.stripScrollState[context]) {
                delete state.stripScrollState[context];
            }
            textImage = renderStaticText(text, fontSize, textDisplayColor);
        }

        const feedback = { displayText: textImage, progressBar: progressBar };
        if (showLabel) feedback.label = label;
        setFeedback(context, feedback);
    }

    /**
     * Render the "Up Next" queue browser: scrollable text list with focused row highlighted.
     * Dial rotation moves the cursor; dial press removes the focused track from the queue.
     */
    function renderQueueBrowser(context, settings, accentColor, textColor, stripSecondary, pressAction = 'remove') {
        const layoutKey = 'queue-browser';
        if (state.lastLayoutState[context] !== layoutKey) {
            state.lastLayoutState[context] = layoutKey;
            setFeedbackLayout(context, {
                id: 'com.dreadheadhippy.ampdeckplus.overlay',
                items: [{ key: 'overlay', type: 'pixmap', rect: [0, 0, 200, 100] }]
            });
        }

        const qbs           = state.getQueueBrowserState(context);
        const isDimmed      = state.playbackState === 'stopped';
        const effectiveAccent = isDimmed ? stripSecondary : accentColor;

        const HEADER_H = 11;
        const ROW_H    = 26;
        const ROWS     = 3;
        const BAR_H    = 10;
        // Layout: 11 + 26×3 + 5 = 94px

        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 100);

        // Header bar
        ctx.fillStyle = isDimmed ? 'rgba(0,0,0,0.75)' : hexToRgba(effectiveAccent, 0.55);
        ctx.fillRect(0, 0, 200, HEADER_H);
        ctx.font = 'bold 9px sans-serif';
        ctx.textBaseline = 'middle';
        const headerMid = HEADER_H / 2;
        ctx.fillStyle = isDimmed ? stripSecondary : textColor;
        ctx.textAlign = 'left';
        ctx.fillText('UP NEXT', 4, headerMid);

        const total       = qbs?.items?.length || 0;
        const cursorIndex = qbs?.cursorIndex   || 0;
        if (total > 0) {
            ctx.fillStyle = isDimmed ? stripSecondary : textColor;
            ctx.textAlign = 'right';
            ctx.fillText(`${cursorIndex + 1} / ${total}`, 197, headerMid);
        }

        // Row area
        if (!qbs || total === 0) {
            ctx.fillStyle = stripSecondary;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(qbs ? 'Queue is empty' : 'Loading\u2026', 100, HEADER_H + (ROW_H * ROWS) / 2);
        } else {
            const windowStart = Math.max(0, Math.min(cursorIndex - 1, total - ROWS));
            const focusedRow  = cursorIndex - windowStart;

            for (let row = 0; row < ROWS; row++) {
                const itemIdx = windowStart + row;
                if (itemIdx >= total) break;
                const item      = qbs.items[itemIdx];
                const isFocused = (row === focusedRow);
                const isLocked  = (itemIdx === 0) && (pressAction === 'remove');
                const rowY      = HEADER_H + row * ROW_H;

                if (isFocused) {
                    // Locked (next track): neutral grey — signals "not interactive" while accent
                    // left bar + accent lock icon still communicate focus and locked state.
                    ctx.fillStyle = isLocked
                        ? (isDimmed ? 'rgba(60,60,60,0.22)' : 'rgba(150,150,150,0.15)')
                        : (isDimmed ? 'rgba(80,80,80,0.25)'  : hexToRgba(effectiveAccent, 0.25));
                    ctx.fillRect(0, rowY, 200, ROW_H);
                    ctx.fillStyle = effectiveAccent;
                    ctx.fillRect(0, rowY, 3, ROW_H);
                }

                // Clip row so long titles don't overflow into adjacent rows
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, rowY, 200, ROW_H);
                ctx.clip();

                const dimAlpha  = isFocused ? 1.0 : 0.65;
                const titleSize = isFocused ? 11 : 10;
                const titleFont = `${isFocused ? 'bold ' : ''}${titleSize}px sans-serif`;

                // Draw a padlock icon in the icon column (accent bar 0–3, title at 21)
                if (isLocked) {
                    // When focused: accent color lock pops against the grey row — clearly locked/special.
                    // When not focused: recede to 50% white so it doesn't compete with title text.
                    const iconColor = isFocused
                        ? (isDimmed ? stripSecondary : effectiveAccent)
                        : (isDimmed
                            ? `rgba(120,120,120,0.50)`
                            : `rgba(255,255,255,0.50)`);

                    const cx       = 12;           // horizontal center of icon column
                    const iconTop  = rowY + 3;     // 3px top padding in 28px row
                    const sR       = 5;            // shackle arc radius
                    const sArcY    = iconTop + 6;  // arc center y  (arc top = iconTop+1)
                    const bodyX    = 4;            // body left edge
                    const bodyW    = 16;           // body width  (right edge = 20)
                    const bodyTop  = sArcY + 2;    // body top (shackle legs enter here)
                    const bodyH    = 14;           // body height → bottom at iconTop+22

                    // Filled body
                    ctx.fillStyle = iconColor;
                    ctx.beginPath();
                    ctx.roundRect(bodyX, bodyTop, bodyW, bodyH, 2);
                    ctx.fill();

                    // Shackle — stroked U-shape above body
                    ctx.strokeStyle = iconColor;
                    ctx.lineWidth   = 1.8;
                    ctx.lineCap     = 'round';
                    ctx.beginPath();
                    ctx.moveTo(cx - sR, bodyTop + 3);  // left leg (inside body)
                    ctx.lineTo(cx - sR, sArcY);         // up to arc
                    ctx.arc(cx, sArcY, sR, Math.PI, 0); // arch over top
                    ctx.lineTo(cx + sR, bodyTop + 3);   // right leg (inside body)
                    ctx.stroke();

                    // Keyhole cutout
                    ctx.fillStyle = isDimmed ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.65)';
                    const ky = bodyTop + 5;
                    ctx.beginPath();
                    ctx.arc(cx, ky, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillRect(cx - 1.5, ky, 3, 3.5); // slot below circle
                }

                const titleX     = isLocked ? 21 : 5;
                const titleWidth = isLocked ? 172 : 188;
                const rawTitle   = item.title || 'Unknown';
                const titleText  = truncateText(ctx, rawTitle, titleFont, titleWidth);
                ctx.font      = titleFont;
                ctx.fillStyle = isDimmed
                    ? `rgba(150,150,150,${dimAlpha})`
                    : `rgba(255,255,255,${dimAlpha})`;
                ctx.textAlign    = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(titleText, titleX, rowY + 3);

                if (item.artist) {
                    const artistFont = '9px sans-serif';
                    // Use the dedicated queue star rating setting; 'none' suppresses display
                    const queueRatingMode = settings.queueRatingMode || 'half';
                    const stars = (item.userRating && queueRatingMode !== 'none')
                        ? formatRating(item.userRating, queueRatingMode) : null;
                    const artistText = truncateText(ctx, item.artist, artistFont, itemIdx === 0 ? 167 : 188);
                    ctx.font      = artistFont;
                    ctx.fillStyle = isDimmed
                        ? `rgba(100,100,100,${dimAlpha})`
                        : `rgba(180,180,180,${dimAlpha})`;
                    ctx.textAlign = 'left';
                    ctx.fillText(artistText, titleX, rowY + 3 + titleSize + 2);
                    if (stars) {
                        ctx.fillStyle = isDimmed
                            ? `rgba(120,120,120,${dimAlpha})`
                            : hexToRgba(effectiveAccent, dimAlpha);
                        ctx.textAlign = 'right';
                        ctx.fillText(stars, 196, rowY + 3 + titleSize + 2);
                        ctx.textAlign = 'left';
                    }
                }

                ctx.restore();
            }
        }

        // Progress bar
        const totalPanels = parseInt(settings.progressTotalPanels) || 3;
        const position    = parseInt(settings.progressPosition)    || 1;
        const progress    = state.displayProgress;
        const barY        = 90; // match other strip modes
        ctx.fillStyle = COLORS.DARK_GRAY;
        ctx.fillRect(0, barY, 200, BAR_H);
        if (position > 0 && position <= totalPanels) {
            const segSize  = 100 / totalPanels;
            const segStart = (position - 1) * segSize;
            const segEnd   = position * segSize;
            if (progress > segStart) {
                const progressInSeg = Math.min(progress, segEnd) - segStart;
                const fillWidth = Math.round((progressInSeg / segSize) * 200);
                if (fillWidth > 0) {
                    ctx.fillStyle = effectiveAccent;
                    ctx.fillRect(0, barY, fillWidth, BAR_H);
                }
            }
        }

        if (isDimmed) {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, 200, 100);
        }

        setFeedback(context, { overlay: canvas.toDataURL('image/png') });
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function truncateText(ctx, text, font, maxWidth) {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (t.length > 0 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
        return t + '\u2026';
    }

    /**
     * Render 3-up poster carousel: prev (dim) | current (highlighted) | next (dim)
     */
    function renderPlaylistCarouselPoster(context, carousel, accentColor) {
        const layoutKey = 'carousel-3up';
        if (state.lastLayoutState[context] !== layoutKey) {
            state.lastLayoutState[context] = layoutKey;
            setFeedbackLayout(context, {
                id: 'com.dreadheadhippy.ampdeckplus.overlay',
                items: [{ key: 'overlay', type: 'pixmap', rect: [0, 0, 200, 100] }]
            });
        }

        if (!carousel || carousel.playlists.length === 0) {
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 200, 100);
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(carousel ? 'No Playlists' : 'Loading...', 100, 50);
            setFeedback(context, { overlay: canvas.toDataURL('image/png') });
            return;
        }

        const playlists = carousel.playlists;
        const n = playlists.length;
        const idx = carousel.index;
        const prevIdx = (idx - 1 + n) % n;
        const nextIdx = (idx + 1) % n;
        const currentPlaylist = playlists[idx];
        const prevPlaylist = n > 1 ? playlists[prevIdx] : null;
        const nextPlaylist = n > 1 ? playlists[nextIdx] : null;

        // Pin progress bar at the same bottom position as Queue and text modes (y=90, h=5).
        const NAME_H = 12;
        const PROG_Y = 90;
        const PROG_H = 10;
        const ART_Y = NAME_H;
        const ART_H = PROG_Y - NAME_H; // art zone between name bar and progress bar
        // Scale poster sizes proportionally to fit art zone (reference: CH=74, SH=50 at ART_H=84)
        const _sc = ART_H / 84;
        const CH = Math.max(Math.floor(74 * _sc), 28), CW = CH;
        const SH = Math.max(Math.floor(50 * _sc), 18), SW = SH;
        // Horizontal: 2 | SW | hGap | CW | hGap | SW | 2 = 200
        const hGap = Math.floor((196 - SW - CW - SW) / 2);
        const SX_L = 2, SX_R = 200 - 2 - SW;
        const CX = SX_L + SW + hGap;
        const SY = ART_Y + Math.round((ART_H - SH) / 2);
        const CY = ART_Y + Math.round((ART_H - CH) / 2);

        // Draw a poster image cover-fit into a clipped rect, or a placeholder
        const drawPoster = (ctx, imgEl, x, y, w, h) => {
            if (imgEl) {
                const iw = imgEl.naturalWidth || w, ih = imgEl.naturalHeight || h;
                const scale = Math.max(w / iw, h / ih);
                const sw = iw * scale, sh = ih * scale;
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.clip();
                ctx.drawImage(imgEl, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
                ctx.restore();
            } else {
                ctx.fillStyle = '#2a2a2a';
                ctx.fillRect(x, y, w, h);
                ctx.save();
                ctx.fillStyle = '#666666';
                ctx.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u266a', x + w / 2, y + h / 2);
                ctx.restore();
            }
        };

        // Resolve an image from cache, trigger async fetch if missing, call back immediately
        const resolveImage = (playlist, callback) => {
            if (!playlist) { callback(null); return; }
            const key = playlist.ratingKey;
            if (posterCache.has(key)) {
                const url = posterCache.get(key);
                if (url) {
                    const img = new Image();
                    img.onload = () => callback(img);
                    img.src = url;
                } else {
                    callback(null);
                }
            } else {
                callback(null); // Placeholder immediately
                if (playlist.compositePath) {
                    plexConnection.fetchAlbumArt(playlist.compositePath)
                        .then(dataUrl => {
                            posterCache.set(key, dataUrl);
                            state.getAllContexts().forEach(ctx => {
                                if (state.getCarouselState(ctx)) {
                                    state.lastLayoutState[ctx] = null;
                                    renderStripLayout(ctx);
                                }
                            });
                        })
                        .catch(() => posterCache.set(key, null));
                } else {
                    posterCache.set(key, null);
                }
            }
        };

        // Collect all 3 images then composite and send
        let prevImg, currImg, nextImg;
        let resolved = 0;
        const tryDraw = () => {
            if (++resolved < 3) return;

            // An overlay (e.g. "PLAYING") may have been set while async image loads were in flight
            if (state.getStripOverlay(context)) return;
            const isDimmed = state.playbackState === 'stopped';
            const effectiveAccent = isDimmed ? COLORS.MEDIUM_GRAY : accentColor;

            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 200, 100);

            // Side posters (draw then dim)
            if (n > 1) {
                drawPoster(ctx, prevImg, SX_L, SY, SW, SH);
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(SX_L, SY, SW, SH);

                drawPoster(ctx, nextImg, SX_R, SY, SW, SH);
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(SX_R, SY, SW, SH);
            }

            // Name bar at top — counter and title at same size, counter right-aligned
            const name = currentPlaylist.title;
            const counterText = `${idx + 1}\u2009/\u2009${n}`;
            ctx.fillStyle = 'rgba(0,0,0,0.78)';
            ctx.fillRect(0, 0, 200, NAME_H);
            // Find the largest font size where both title and counter fit
            let ns = 11;
            ctx.font = `bold ${ns}px sans-serif`;
            const counterW = ctx.measureText(counterText).width + 6; // 3px padding each side
            while (ns > 7 && ctx.measureText(name).width > (196 - counterW)) { ns--; ctx.font = `bold ${ns}px sans-serif`; }
            // Draw title
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isDimmed ? COLORS.MEDIUM_GRAY : COLORS.WHITE;
            ctx.fillText(name, 100, NAME_H / 2);
            // Draw counter (same font size, right side)
            ctx.fillStyle = effectiveAccent;
            ctx.textAlign = 'right';
            ctx.fillText(counterText, 198, NAME_H / 2);

            // Center poster with 1px accent border
            ctx.fillStyle = effectiveAccent;
            ctx.fillRect(CX - 1, CY - 1, CW + 2, CH + 2);
            drawPoster(ctx, currImg, CX, CY, CW, CH);

            // Progress bar at bottom
            const pgSettings = state.getActionSettings(context);
            const totalPanels = parseInt(pgSettings.progressTotalPanels) || 1;
            const position = parseInt(pgSettings.progressPosition) || 0;
            const progress = state.displayProgress;
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.fillRect(0, PROG_Y, 200, PROG_H);
            if (position > 0 && position <= totalPanels) {
                const segSize = 100 / totalPanels;
                const segStart = (position - 1) * segSize;
                const segEnd = position * segSize;
                if (progress > segStart) {
                    const progressInSeg = Math.min(progress, segEnd) - segStart;
                    const fillWidth = Math.round((progressInSeg / segSize) * 200);
                    if (fillWidth > 0) {
                        ctx.fillStyle = effectiveAccent;
                        ctx.fillRect(0, PROG_Y, fillWidth, PROG_H);
                    }
                }
            }

            // Poster dim overlay — same weight as text carousel grey
            if (isDimmed) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, 200, 100);
            }

            setFeedback(context, { overlay: canvas.toDataURL('image/png') });
        };

        resolveImage(prevPlaylist, img => { prevImg = img; tryDraw(); });
        resolveImage(currentPlaylist, img => { currImg = img; tryDraw(); });
        resolveImage(nextPlaylist, img => { nextImg = img; tryDraw(); });
    }

    /**
     * Render playlist carousel mode for the strip
     */
    function renderPlaylistCarousel(context, settings, fontSize, totalPanels, position, textColor, accentColor, stripSecondary) {
        const style = settings.carouselStyle || 'text';
        if (style === 'poster') {
            return renderPlaylistCarouselPoster(context, state.getCarouselState(context), accentColor);
        }

        const carousel = state.getCarouselState(context);
        const isDimmed = state.playbackState === 'stopped';
        const labelColor = isDimmed ? stripSecondary : textColor;
        const textDisplayColor = isDimmed ? stripSecondary : textColor;

        let label, text;
        if (!carousel || carousel.playlists.length === 0) {
            label = 'PLAYLISTS';
            text = carousel ? 'No Playlists' : 'Loading...';
        } else {
            const total = carousel.playlists.length;
            const idx = carousel.index;
            label = `PLAYLIST ${idx + 1} / ${total}`;
            text = carousel.playlists[idx].title;
        }

        const showLabel = settings.showStripLabel !== false; // default true
        const labelSize = Math.max(14, Math.round(fontSize * 0.85));
        const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, accentColor);
        const textAreaH = fontSize + 8;
        const labelHeight = labelSize + 4;
        const progressBarHeight = 10;

        // Pin progress bar a few pixels from the bottom
        const progressY = 90;
        let labelY, textY;
        if (showLabel) {
            // 3 equal gaps: above label, between label & text, between text & bar
            const gap = (progressY - labelHeight - textAreaH) / 3;
            labelY = gap;
            textY = gap + labelHeight + gap;
        } else {
            textY = (progressY - textAreaH) / 2;
        }

        const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}|${showLabel}`;

        if (state.lastLayoutState[context] !== layoutKey) {
            state.lastLayoutState[context] = layoutKey;
            const items = [];
            if (showLabel) {
                items.push({
                    key: 'label',
                    type: 'text',
                    rect: [0, labelY, 200, labelHeight],
                    font: { size: labelSize, weight: 700 },
                    color: labelColor,
                    alignment: 'center'
                });
            }
            items.push(
                {
                    key: 'displayText',
                    type: 'pixmap',
                    rect: [0, textY, 200, textAreaH]
                },
                {
                    key: 'progressBar',
                    type: 'pixmap',
                    rect: [0, progressY, 200, progressBarHeight]
                }
            );
            setFeedbackLayout(context, {
                id: 'com.dreadheadhippy.ampdeckplus.layout',
                items: items
            });
        }

        const font = `${fontSize}px sans-serif`;
        const needsScroll = measureTextWidth(text, font) > 190;

        let textImage;
        if (needsScroll) {
            textImage = renderScrollingText(context, text, fontSize, textDisplayColor);
        } else {
            if (state.stripScrollState[context]) {
                delete state.stripScrollState[context];
            }
            textImage = renderStaticText(text, fontSize, textDisplayColor);
        }

        const feedback = { displayText: textImage, progressBar: progressBar };
        if (showLabel) feedback.label = label;
        setFeedback(context, feedback);
    }

    /**
     * Render static text (no scrolling needed)
     */
    function renderStaticText(text, fontSize, color) {
        const canvasW = 200;
        const canvasH = fontSize + 8;
        const font = `${fontSize}px sans-serif`;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(text, canvasW / 2, 2);

        return canvas.toDataURL('image/png');
    }

    /**
     * Render scrolling text
     */
    function renderScrollingText(context, text, fontSize, color) {
        const canvasW = 200;
        const canvasH = fontSize + 8;
        const font = `${fontSize}px sans-serif`;

        // Get or initialize scroll state
        if (!state.stripScrollState[context]) {
            state.stripScrollState[context] = {
                offset: 0,
                isPaused: true,
                pauseStart: Date.now(),
                lastUpdate: Date.now()
            };
        }

        const scrollState = state.stripScrollState[context];
        const now = Date.now();
        const elapsed = now - scrollState.lastUpdate;
        scrollState.lastUpdate = now;

        const textWidth = measureTextWidth(text, font);
        const maxScroll = textWidth + SCROLL.GAP;

        // Handle scrolling logic
        if (scrollState.isPaused) {
            if (now - scrollState.pauseStart >= SCROLL.PAUSE) {
                scrollState.isPaused = false;
            }
        } else {
            const scrollAmount = (SCROLL.SPEED * elapsed) / 1000;
            scrollState.offset += scrollAmount;

            if (scrollState.offset >= maxScroll) {
                scrollState.offset = 0;
                scrollState.isPaused = true;
                scrollState.pauseStart = now;
            }
        }

        // Render text
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';

        // Draw text twice for seamless loop
        const x1 = -scrollState.offset;
        const x2 = x1 + textWidth + SCROLL.GAP;
        
        ctx.fillText(text, x1, 2);
        ctx.fillText(text, x2, 2);

        return canvas.toDataURL('image/png');
    }

    /**
     * Create progress bar segment for multi-panel strips
     */
    function createProgressBarSegment(position, totalPanels, progress, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.DARK_GRAY;
        ctx.fillRect(0, 0, 200, 10);

        if (position > 0 && position <= totalPanels) {
            const segSize = 100 / totalPanels;
            const segStart = (position - 1) * segSize;
            const segEnd = position * segSize;
            
            if (progress > segStart) {
                const progressInSeg = Math.min(progress, segEnd) - segStart;
                const fillWidth = Math.round((progressInSeg / segSize) * 200);
                if (fillWidth > 0) {
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, fillWidth, 10);
                }
            }
        }
        
        return canvas.toDataURL('image/png');
    }

    /**
     * Display temporary overlay on strip
     */
    /**
     * Show overlay on strip with title and optional subtitle
     * @param {string} context - Action context
     * @param {string} title - Main title text
     * @param {string} subtitle - Optional subtitle (value display)
     */
    function showStripOverlay(context, title, subtitle = null) {
        // Clear any existing timer to prevent premature dismissal
        const existingOverlay = state.getStripOverlay(context);
        if (existingOverlay?.timer) {
            clearTimeout(existingOverlay.timer);
        }

        // Render overlay
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, 200, 100);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COLORS.WHITE;

        if (subtitle) {
            // Two-line display — auto-size subtitle to fit within canvas width
            const titleSize = 24;
            let subtitleSize = 44;
            ctx.font = `bold ${subtitleSize}px sans-serif`;
            while (subtitleSize > 12 && ctx.measureText(subtitle).width > 190) {
                subtitleSize -= 2;
                ctx.font = `bold ${subtitleSize}px sans-serif`;
            }
            const totalContent = titleSize + subtitleSize;
            const gap = (100 - totalContent) / 3;

            const titleY = gap + titleSize / 2;
            const subtitleY = gap + titleSize + gap + subtitleSize / 2;

            ctx.font = `bold ${titleSize}px sans-serif`;
            ctx.fillText(title, 100, titleY);
            ctx.font = `bold ${subtitleSize}px sans-serif`;
            ctx.fillText(subtitle, 100, subtitleY);
        } else {
            // Single line display — auto-size to fit within canvas width
            let singleSize = 36;
            ctx.font = `bold ${singleSize}px sans-serif`;
            while (singleSize > 12 && ctx.measureText(title).width > 190) {
                singleSize -= 2;
                ctx.font = `bold ${singleSize}px sans-serif`;
            }
            ctx.fillText(title, 100, 50);
        }

        const overlayImage = canvas.toDataURL('image/png');

        // Store overlay state FIRST so any concurrent renderStripLayout call sees it immediately
        const timer = setTimeout(() => {
            state.clearStripOverlay(context);
            state.lastLayoutState[context] = null;
            renderStripLayout(context);
        }, 1500);

        state.setStripOverlay(context, {
            title: title,
            subtitle: subtitle,
            timer: timer
        });

        // Send layout and feedback after state is locked in
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.overlay',
            items: [
                {
                    key: 'overlay',
                    type: 'pixmap',
                    rect: [0, 0, 200, 100]
                }
            ]
        });

        setFeedback(context, { overlay: overlayImage });

        logger.debug(`Overlay shown: ${title}${subtitle ? ' - ' + subtitle : ''}`);
    }

    /**
     * Send feedback layout to Stream Deck
     */
    function setFeedbackLayout(context, layout) {
        if (state.connection && state.connection.isConnected()) {
            state.connection.send({
                event: 'setFeedbackLayout',
                context: context,
                payload: { layout: layout }
            });
        }
    }

    /**
     * Send feedback to Stream Deck
     */
    function setFeedback(context, payload) {
        if (state.connection && state.connection.isConnected()) {
            state.connection.send({
                event: 'setFeedback',
                context: context,
                payload: payload
            });
        }
    }

    /**
     * Clear poster image cache (call when playlists are reloaded)
     */
    function clearCarouselPosterCache() {
        posterCache.clear();
    }

    var layoutManager = {
        renderStripLayout,
        showStripOverlay,
        clearCarouselPosterCache
    };

    /**
     * Ampdeck+ v2.0.0
     * Professional Stream Deck Plugin for Plexamp
     * Modular architecture with automatic reconnection
     */


    // Connection manager
    let connection = null;

    // Polling health tracking
    let isPollingInFlight = false;
    let lastSuccessfulPoll = 0;

    // Per-context cache of the containerKey whose items are already loaded.
    // Avoids redundant HTTP fetches when switching back to queue mode.
    const queueItemsCache = {};

    // Play/pause morph animation


    // ============================================
    // STREAM DECK CONNECTION
    // ============================================

    /**
     * Entry point called by Stream Deck
     * This function MUST be global for Stream Deck to find it
     */
    function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, _inInfo) {
        logger.info(`Ampdeck+ v${VERSION} initializing...`);
        
        connection = new ConnectionManager(handleStreamDeckMessage);
        connection.connect(inPort, inPluginUUID, inRegisterEvent);
        
        // Store connection manager in state so renderers always use the current socket
        state.pluginUUID = inPluginUUID;
        state.connection = connection;

        // Give logger access to the connection so it can write to Stream Deck's log file
        logger.setConnection(connection);
    }

    /**
     * Handle messages from Stream Deck
     */
    function handleStreamDeckMessage(data) {
        switch (data.event) {
            case 'willAppear':
                onWillAppear(data);
                break;
            case 'willDisappear':
                onWillDisappear(data);
                break;
            case 'didReceiveGlobalSettings':
                onDidReceiveGlobalSettings(data);
                break;
            case 'didReceiveSettings':
                onDidReceiveSettings(data);
                break;
            case 'keyDown':
                onKeyDown(data);
                break;
            case 'keyUp':
                onKeyUp(data);
                break;
            case 'dialRotate':
                onDialRotate(data);
                break;
            case 'dialDown':
                onDialDown(data);
                break;
            case 'dialUp':
                onDialUp(data);
                break;
            case 'touchTap':
                onTouchTap(data);
                break;
            case 'systemDidWakeUp':
                // Stream Deck fires this on OS sleep/wake and when restored from tray.
                // Web Worker timers are throttled by CEF while the window is hidden,
                // so we restart the poll cycle to guarantee fresh state immediately.
                logger.info('System wake detected, restarting poll cycle');
                stopPolling();
                if (state.hasActions()) {
                    startPolling();
                }
                break;
        }
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    function onWillAppear(data) {
        const { context, action } = data;
        const settings = data.payload.settings || {};
        
        state.addAction(context, action, settings);
        applySettingsToGlobal();
        startPolling();
        
        // Load playlists into carousel state if in playlists display mode
        if (action === ACTIONS.STRIP && settings.displayMode === 'playlists') {
            loadCarouselPlaylists(context);
        }

        // Load queue items if in queue display mode
        if (action === ACTIONS.STRIP && settings.displayMode === 'queue') {
            loadQueueItems(context);
        }

        // Initial render
        updateDisplay(context);
        
        logger.debug(`Action appeared: ${action}`);
    }

    function onWillDisappear(data) {
        const { context } = data;
        
        // Clean up hold state
        if (state.buttonHoldState[context]) {
            // Set isHolding to false to stop recursive seek
            state.buttonHoldState[context].isHolding = false;
            delete state.buttonHoldState[context];
        }
        
        delete queueItemsCache[context];
        state.removeAction(context);
        
        if (!state.hasActions()) {
            stopPolling();
        }
        
        logger.debug(`Action disappeared`);
    }

    function onDidReceiveGlobalSettings(data) {
        const settings = data.payload.settings || {};
        
        // Debug logging to track sign out issues
        logger.info('Global settings received', {
            hasToken: !!(settings.plexToken),
            hasServer: !!(settings.plexServerUrl),
            hasPlayer: !!(settings.playerUrl),
            hasClient: !!(settings.clientName),
            tokenLength: settings.plexToken ? settings.plexToken.length : 0,
            serverUrl: settings.plexServerUrl || 'empty',
            playerUrl: settings.playerUrl || 'empty'
        });
        
        // Global settings are the authoritative source for ALL preferences.
        // This includes display settings (dynamicColors, textColor, debugMode, syncOffset)
        // which must not be overwritten by per-action settings in applySettingsToGlobal.
        state.updateGlobalSettings(settings);
        updateLogLevel();
        configurePlexConnection();
        
        logger.debug('Global settings applied');
        
        // Start polling if configured, stop if credentials removed
        if (settings.plexToken && settings.plexServerUrl) {
            startPolling(); // restarts workers if they were stopped (e.g. after sign-out)

            // Re-render all displays so the correct textColor/dynamicColors are
            // applied immediately rather than waiting for the next render tick.
            // Without this, stale per-action settings from willAppear can persist
            // until the next render cycle after global settings arrive.
            updateAllDisplays();
            state.getAllContexts().forEach(context => {
                const actionData = state.getAction(context);
                if (!actionData) return;
                if (actionData.action !== ACTIONS.STRIP) return;
                const actionSettings = state.getActionSettings(context) || {};
                if (actionSettings.displayMode !== 'playlists') return;
                const existing = state.getCarouselState(context);
                if (!existing || existing.playlists.length === 0) {
                    loadCarouselPlaylists(context);
                }
            });
        } else {
            // Credentials removed - stop polling and clear displays
            logger.info('Credentials cleared - stopping polling and resetting displays');
            stopPolling();
            state.clearTrack();
            updateAllDisplays();
        }
    }

    function onDidReceiveSettings(data) {
        const { context } = data;
        const settings = data.payload.settings || {};
        
        state.updateActionSettings(context, settings);
        applySettingsToGlobal();
        
        // Reset layout and runtime toggle state to force refresh
        state.lastLayoutState[context] = null;
        state.clearActiveDisplayMode(context);
        
        // Reload playlist carousel if mode changed to playlists
        const action = state.getAction(context)?.action;
        if (action === ACTIONS.STRIP && settings.displayMode === 'playlists') {
            loadCarouselPlaylists(context);
        }

        // Reload queue if mode changed to queue
        if (action === ACTIONS.STRIP && settings.displayMode === 'queue') {
            loadQueueItems(context);
        }

        updateDisplayPosition();
        updateAllDisplays();
        
        logger.debug('Action settings received');
    }

    function onKeyDown(data) {
        const { context, action } = data;

        // Initialize hold state before the stopped check so keyUp can still fire
        // actions that are valid from stopped state (e.g. PLAYLIST launches Plexamp).
        state.buttonHoldState[context] = {
            pressTime: Date.now(),
            action: action,
            didSeek: false,
            isHolding: false
        };

        if (state.playbackState === 'stopped' || state.playbackState === 'idle') {
            return;
        }

        // Long-press stop for Play/Pause and Album Art (mirrors Plexamp mobile behaviour)
        if (action === ACTIONS.PLAY_PAUSE || action === ACTIONS.ALBUM_ART) {
            const thisHoldState = state.buttonHoldState[context];
            setTimeout(async () => {
                const holdState = state.buttonHoldState[context];
                if (!holdState || holdState !== thisHoldState || holdState.didStop) return;
                holdState.didStop = true;
                await playbackController.stop();
                updateAllDisplays();
            }, TIMING.HOLD_THRESHOLD);
        }

        // Long-press mute/unmute for Volume Down
        if (action === ACTIONS.VOLUME_DOWN) {
            // Capture the exact holdState object created above so a later rapid press
            // can't be mistaken for this one when the timeout fires.
            const thisHoldState = state.buttonHoldState[context];
            setTimeout(async () => {
                const holdState = state.buttonHoldState[context];
                // Bail if the hold state is gone or belongs to a different press
                if (!holdState || holdState !== thisHoldState || holdState.didMute) return;
                holdState.didMute = true;

                if (state.muteRestoreVolume !== null) {
                    // Already muted/faded — restore volume then resume playback
                    state.activeFadeTimer = null;   // generation mismatch stops any in-progress async fade
                    state.activeFadeContext = null;
                    const restoreVol = state.muteRestoreVolume;
                    state.muteRestoreVolume = null;
                    await playbackController.setVolume(restoreVol);
                    await playbackController.play();
                } else {
                    // Save current volume as restore target
                    state.muteRestoreVolume = state.currentVolume > 0 ? state.currentVolume : 50;

                    const settings = state.getActionSettings(context) || {};
                    if (settings.fadeOut) {
                        // Fade-out mode: serial doFadeTick loop with a short abort timeout.
                        // Each tick awaits the volume command but aborts it after FADE_TIMEOUT_MS
                        // and moves on immediately — Plexamp applies the volume the instant it
                        // receives the TCP data, well before the HTTP response arrives. Aborting
                        // early lets us tick every ~FADE_TIMEOUT_MS instead of every ~600-1000ms,
                        // giving 15+ steps instead of 3–5 regardless of API response latency.
                        // A generation counter lets cancellation work safely across awaits.
                        const gen = Date.now();
                        state.activeFadeTimer = gen;
                        state.activeFadeContext = context;

                        const fadeStartVolume = state.currentVolume;
                        const fadeStartTime = Date.now();
                        const fadeDurationMs = settings.fadeDuration != null && settings.fadeDuration >= 1
                            ? settings.fadeDuration * 1000
                            : VOLUME.FADE_DURATION;

                        let lastSentVolume = fadeStartVolume;

                        const doFadeTick = async () => {
                            if (state.activeFadeTimer !== gen) return; // cancelled
                            const tickStart = Date.now();
                            const elapsed = tickStart - fadeStartTime;
                            const progress = Math.min(elapsed / fadeDurationMs, 1);
                            // Logarithmic curve: each step is a fixed percentage of the remaining
                            // volume, matching how human hearing perceives loudness. A linear fade
                            // sounds like the bottom half drops suddenly; log sounds even throughout.
                            const newVolume = Math.max(0, Math.round(fadeStartVolume * Math.pow(1 - progress, 2.5)));

                            if (progress >= 1 || newVolume <= 0) {
                                // Final step: use full-timeout setVolume for reliable ordering before pause.
                                await playbackController.setVolume(0);
                                if (state.activeFadeTimer !== gen) return; // cancelled during await
                                state.activeFadeTimer = null;
                                state.activeFadeContext = null;
                                await playbackController.pause();
                                updateDisplay(context); // clear FADING label
                                return;
                            }

                            // Only send when volume actually changed; use short abort timeout
                            // (no server fallback) so each tick takes at most FADE_TIMEOUT_MS.
                            if (newVolume !== lastSentVolume) {
                                lastSentVolume = newVolume;
                                await playbackController.setVolume(newVolume, VOLUME.FADE_TIMEOUT_MS, true);
                                if (state.activeFadeTimer !== gen) return; // cancelled during await
                            }

                            const tickDuration = Date.now() - tickStart;
                            setTimeout(doFadeTick, Math.max(0, VOLUME.FADE_INTERVAL - tickDuration));
                        };
                        doFadeTick();
                    } else {
                        // Instant mute — go to 0 then pause
                        await playbackController.setVolume(0);
                        await playbackController.pause();
                    }
                }
            }, TIMING.HOLD_THRESHOLD);
        }

        // Start hold-to-seek timer for prev/next
        if (action === ACTIONS.PREVIOUS || action === ACTIONS.NEXT) {
            setTimeout(() => {
                const holdState = state.buttonHoldState[context];
                if (holdState && !holdState.didSeek) {
                    holdState.didSeek = true;
                    holdState.isHolding = true;
                    holdState.animationFrame = 0;
                    const direction = action === ACTIONS.PREVIOUS ? -1 : 1;
                    
                    // Track target position locally to avoid stale state.currentPosition
                    holdState.targetPosition = state.currentPosition;
                    
                    // Recursive seek function - waits for each seek to complete before the next
                    const performSeek = async () => {
                        const hs = state.buttonHoldState[context];
                        if (!hs || !hs.isHolding) return; // Button was released
                        
                        // Increment animation frame
                        hs.animationFrame = (hs.animationFrame || 0) + 1;
                        
                        // Update button with animation
                        if (action === ACTIONS.PREVIOUS) {
                            buttonRenderer.renderPrevious(context, hs.animationFrame);
                        } else {
                            buttonRenderer.renderNext(context, hs.animationFrame);
                        }
                        
                        // Increment target position
                        hs.targetPosition += direction * TIMING.SEEK_AMOUNT;
                        
                        // Clamp to valid range
                        const clampedPos = Math.max(0, Math.min(hs.targetPosition, state.trackDuration));
                        
                        // Check if we hit a boundary
                        if (clampedPos !== hs.targetPosition) {
                            // Hit boundary, stop seeking
                            hs.isHolding = false;
                            if (action === ACTIONS.PREVIOUS) {
                                buttonRenderer.renderPrevious(context);
                            } else {
                                buttonRenderer.renderNext(context);
                            }
                            return;
                        }
                        
                        // Perform the seek
                        try {
                            await playbackController.seekTo(clampedPos);
                        } catch {
                            // Seek failed, but continue trying
                        }
                        
                        // Wait before next seek
                        setTimeout(() => performSeek(), TIMING.SEEK_INTERVAL);
                    };
                    
                    // Initial button animation
                    if (action === ACTIONS.PREVIOUS) {
                        buttonRenderer.renderPrevious(context, 0);
                    } else {
                        buttonRenderer.renderNext(context, 0);
                    }
                    
                    // Start seeking
                    performSeek();
                }
            }, TIMING.HOLD_THRESHOLD);
        }
    }

    function onKeyUp(data) {
        const { context,action } = data;
        const holdState = state.buttonHoldState[context];
        
        if (!holdState) return;
        
        // Stop seeking by setting flag (recursive function checks this)
        if (holdState.isHolding) {
            holdState.isHolding = false;
        }
        
        // While muted/held, a short press on Volume Down must not corrupt the restore target.
        // Treat it as a no-op so only a long-press can restore.
        if (action === ACTIONS.VOLUME_DOWN && state.muteRestoreVolume !== null && !holdState.didMute) {
            delete state.buttonHoldState[context];
            return;
        }

        // If we were seeking, muting, or stopping, don't also fire the tap action
        if (holdState.didSeek || holdState.didMute || holdState.didStop) {
            // Reset button to normal state immediately so the display reflects the
            // post-action volume rather than whatever was cached before the hold.
            if (action === ACTIONS.PREVIOUS) {
                buttonRenderer.renderPrevious(context);
            } else if (action === ACTIONS.NEXT) {
                buttonRenderer.renderNext(context);
            } else if (action === ACTIONS.VOLUME_DOWN) {
                buttonRenderer.renderVolumeDown(context);
            }
            delete state.buttonHoldState[context];
            return;
        }
        
        delete state.buttonHoldState[context];
        
        // Execute button action
        handleButtonAction(action, context);
    }

    function onDialRotate(data) {
        const { context, payload } = data;
        const action = state.getAction(context)?.action;
        const settings = state.getActionSettings(context) || {};
        const ticks = payload.ticks || 0;
        
        if (!action || action !== ACTIONS.STRIP) return;

        const dialAction = settings.dialAction || 'none';
        const effectiveMode = state.getActiveDisplayMode(context) || settings.displayMode;

        // Playlist carousel mode: dial rotation navigates the list
        if (effectiveMode === 'playlists') {
            if (state.playbackState === 'stopped') return; // Plexamp not running
            const carousel = state.getCarouselState(context);
            if (!carousel || carousel.playlists.length === 0) return;
            const total = carousel.playlists.length;
            carousel.index = ((carousel.index + ticks) % total + total) % total;
            state.setCarouselState(context, carousel);
            layoutManager.renderStripLayout(context);
            return;
        }

        // Queue browser mode: dial rotation moves the cursor
        if (effectiveMode === 'queue') {
            const qbs = state.getQueueBrowserState(context);
            if (!qbs || qbs.items.length === 0) return;
            const newCursor = Math.max(0, Math.min((qbs.cursorIndex || 0) + ticks, qbs.items.length - 1));
            // Copy state, clear any in-progress removal animation
            state.setQueueBrowserState(context, { items: qbs.items, cursorIndex: newCursor, removalOffset: 0 });
            layoutManager.renderStripLayout(context);
            return;
        }

        if (state.playbackState === 'stopped' || state.playbackState === 'idle') return; // Plexamp not running — ignore volume/skip/rating dial input

        // Handle dial rotation based on user's configured action
        if (dialAction === 'skip') {
            if (ticks > 0) {
                playbackController.skipNext();
                setTimeout(pollTimeline, 300);
                setTimeout(pollTimeline, 700);
                layoutManager.showStripOverlay(context, 'NEXT', '▶▶');
            } else if (ticks < 0) {
                playbackController.skipPrevious();
                setTimeout(pollTimeline, 300);
                setTimeout(pollTimeline, 700);
                layoutManager.showStripOverlay(context, 'PREVIOUS', '◀◀');
            }
        } else if (dialAction === 'volume') {
            const newVolume = Math.max(0, Math.min(100, state.currentVolume + (ticks * VOLUME.STEP)));
            playbackController.setVolume(newVolume);
            layoutManager.showStripOverlay(context, 'VOLUME', newVolume + '%');
        } else if (dialAction === 'rating') {
            if (!state.currentTrack) {
                logger.debug('Cannot rate: no current track');
                return;
            }
            
            const ratingMode = settings.ratingMode || 'half';
            // Single-star mode on dial acts like full-star increments (dial is continuous, toggle doesn't fit)
            const step = ratingMode === 'half' ? RATING.HALF_STAR : RATING.FULL_STAR;
            const newRating = Math.max(0, Math.min(10, state.currentRating + (ticks * step)));
            
            // Update rating locally immediately
            state.currentRating = newRating;
            
            // Cache this rating for this track
            if (state.currentTrack?.ratingKey) {
                state.setUserRating(state.currentTrack.ratingKey, newRating);
            }
            
            // Show overlay — for single-star mode show actual stars since dial is continuous
            const overlayMode = ratingMode === 'single' ? 'full' : ratingMode;
            const stars = formatRating(newRating, overlayMode);
            layoutManager.showStripOverlay(context, 'RATING', stars);
            
            // Debounce: save rating after 2 seconds of inactivity
            if (state.ratingSaveTimer) {
                clearTimeout(state.ratingSaveTimer);
            }
            
            // Capture ratingKey now so a skip before the timer fires doesn't lose/misroute the rating
            const ratingKeyToSave = state.currentTrack?.ratingKey;
            state.ratingSaveTimer = setTimeout(() => {
                playbackController.setRating(newRating, ratingKeyToSave);
                state.ratingSaveTimer = null;
            }, 2000);
        }
    }

    function onDialDown(data) {
        const { context } = data;
        const action = state.getAction(context)?.action;
        
        if (action !== ACTIONS.STRIP) return;

        const settings = state.getActionSettings(context) || {};
        const effectiveMode = state.getActiveDisplayMode(context) || settings.displayMode;

        if (effectiveMode === 'playlists') {
            // Record press; onDialUp will fire the play action
            if (state.playbackState === 'stopped') return; // Plexamp not running
            state.dialHoldState[context] = { pressTime: Date.now() };
            return;
        }

        if (effectiveMode === 'queue') {
            // Record press; onDialUp will fire the remove action
            if (state.playbackState === 'stopped' || state.playbackState === 'idle') return;
            state.dialHoldState[context] = { pressTime: Date.now() };
            return;
        }

        if (state.playbackState === 'stopped' || state.playbackState === 'idle') return; // togglePlayPause needs Plexamp running
        playbackController.togglePlayPause();
    }

    function onDialUp(data) {
        const { context } = data;
        const action = state.getAction(context)?.action;
        
        if (action !== ACTIONS.STRIP) return;

        const settings = state.getActionSettings(context) || {};
        const effectiveMode = state.getActiveDisplayMode(context) || settings.displayMode;

        if (effectiveMode === 'playlists') {
            delete state.dialHoldState[context];

            // Press: play the currently highlighted playlist (launch Plexamp first if not running)
            const carousel = state.getCarouselState(context);
            if (!carousel || carousel.playlists.length === 0) return;

            const playlist = carousel.playlists[carousel.index];
            if (!playlist?.ratingKey) return;

            state.currentPlaylistName = playlist.title;
            playbackController.playPlaylist(playlist.ratingKey, settings.carouselShuffle === true);
            layoutManager.showStripOverlay(context, 'PLAYING', playlist.title);
        }

        if (effectiveMode === 'queue') {
            delete state.dialHoldState[context];

            const qbs = state.getQueueBrowserState(context);
            if (!qbs || qbs.items.length === 0) return;
            const targetIdx  = qbs.cursorIndex;
            const targetItem = qbs.items[targetIdx];
            if (!targetItem) return;

            const pressAction = settings.queuePressAction || 'remove';

            if (pressAction === 'play') {
                // Skip to the highlighted track in the queue
                plexConnection.playerCommand(
                    '/player/playback/skipTo',
                    { key: targetItem.key, playQueueItemID: targetItem.playQueueItemID }
                )
                    .catch(err => logger.warn(`Queue skip failed: ${err.message}`))
                    .finally(() => loadQueueItems(context, { forceRefresh: true, resetCursor: true }));
                return;
            }

            // Default: remove from queue
            // The very next track (index 0) is pre-buffered by Plexamp and cannot be
            // reliably removed — kicking it causes a snap-back to the current song.
            if (targetIdx === 0) return;

            // Instant removal from local list
            const newItems  = qbs.items.filter((_, i) => i !== targetIdx);
            const newCursor = Math.min(targetIdx, Math.max(0, newItems.length - 1));
            state.setQueueBrowserState(context, { items: newItems, cursorIndex: newCursor });
            layoutManager.renderStripLayout(context);

            // When kicking the pre-buffered next track (index 0), Plexamp will play it
            // from its audio buffer regardless of the server queue deletion. Store C's key
            // so the playMedia re-sync on the next poll skips straight to C instead of
            // re-anchoring on B (which is now deleted and causes a snap-back to A).
            state.hadRecentKicks = true;
            state.kickedNextTrackKey = (targetIdx === 0 && newItems.length > 0)
                ? (newItems[0].key || null)
                : null;
            plexConnection.removeFromQueue(targetItem.queueID, targetItem.playQueueItemID)
                .catch(err => logger.warn(`Queue removal failed: ${err.message}`))
                .finally(() => loadQueueItems(context, { forceRefresh: true }));
        }
    }

    function onTouchTap(data) {
        const { context } = data;
        const action = state.getAction(context)?.action;
        
        if (action !== ACTIONS.STRIP) return;

        const settings = state.getActionSettings(context) || {};

        // Toggle between playlist carousel and queue view when the checkbox is enabled
        if (settings.queuePlaylistToggle && settings.displayMode === 'playlists') {
            const activeMode = state.getActiveDisplayMode(context) || 'playlists';
            if (activeMode === 'playlists') {
                state.setActiveDisplayMode(context, 'queue');
                loadQueueItems(context);
            } else {
                state.clearActiveDisplayMode(context);
                state.lastLayoutState[context] = null;
                layoutManager.renderStripLayout(context);
            }
            return;
        }
        
        // Tap anywhere on touch strip to play/pause
        if (state.playbackState === 'stopped' || state.playbackState === 'idle') return; // Plexamp not running
        playbackController.togglePlayPause();
    }

    // ============================================
    // BUTTON ACTIONS
    // ============================================

    async function handleButtonAction(action, context) {
        // PLAYLIST is allowed when stopped or idle — it launches Plexamp and starts playback.
        if ((state.playbackState === 'stopped' || state.playbackState === 'idle') && action !== ACTIONS.PLAYLIST) return;

        switch (action) {
            case ACTIONS.ALBUM_ART:
                await playbackController.togglePlayPause();
                break;
            case ACTIONS.PLAY_PAUSE:
                await playbackController.togglePlayPause();
                break;
            case ACTIONS.PLAY:
                await playbackController.play();
                break;
            case ACTIONS.PAUSE:
                await playbackController.pause();
                break;
            case ACTIONS.NEXT:
                await playbackController.skipNext();
                setTimeout(pollTimeline, 300);
                setTimeout(pollTimeline, 700);
                break;
            case ACTIONS.PREVIOUS:
                await playbackController.skipPrevious();
                setTimeout(pollTimeline, 300);
                setTimeout(pollTimeline, 700);
                break;
            case ACTIONS.SHUFFLE:
                await playbackController.toggleShuffle();
                break;
            case ACTIONS.REPEAT:
                await playbackController.toggleRepeat();
                break;
            case ACTIONS.RATING:
                if (!state.currentTrack) {
                    logger.debug('Cannot rate: no current track');
                    return;
                }
                
                // Read rating mode from settings
                const settings = state.getActionSettings(context) || {};
                const ratingMode = settings.ratingMode || 'half';
                
                // Calculate new rating
                let newRating;
                if (ratingMode === 'single') {
                    // 3-state cycle matching Plexamp single-star: unrated → liked → disliked → unrated
                    if (state.currentRating === 0) {
                        newRating = RATING.SINGLE_LIKED;       // empty star → filled star (liked)
                    } else if (state.currentRating === RATING.SINGLE_LIKED) {
                        newRating = RATING.SINGLE_DISLIKED;    // filled star → crossed star (disliked)
                    } else {
                        newRating = 0;                         // crossed star (or any other) → empty star
                    }
                } else {
                    const step = ratingMode === 'half' ? RATING.HALF_STAR : RATING.FULL_STAR;
                    newRating = state.currentRating + step;
                    if (newRating > RATING.MAX) newRating = 0; // Wrap to 0
                }
                
                // Update rating locally immediately
                state.currentRating = newRating;
                
                // Cache this rating for this track
                if (state.currentTrack?.ratingKey) {
                    state.setUserRating(state.currentTrack.ratingKey, newRating);
                }
                
                // Debounce: save rating after 2 seconds of inactivity
                if (state.ratingSaveTimer) {
                    clearTimeout(state.ratingSaveTimer);
                }
                
                // Capture ratingKey now so a skip before the timer fires doesn't lose/misroute the rating
                const ratingKeyToSave = state.currentTrack?.ratingKey;
                state.ratingSaveTimer = setTimeout(() => {
                    playbackController.setRating(newRating, ratingKeyToSave);
                    state.ratingSaveTimer = null;
                }, 2000);
                break;
            case ACTIONS.TIME:
                // Toggle between elapsed and remaining time display
                state.toggleTimeDisplayMode(context);
                logger.debug(`Time display mode toggled to: ${state.getTimeDisplayMode(context)}`);
                break;
            case ACTIONS.TRACK_TITLE:
                // No tap action for track title button
                break;
            case ACTIONS.SKIP_ALBUM:
                await playbackController.skipToNextAlbum();
                break;
            case ACTIONS.PREV_ALBUM:
                await playbackController.skipToPrevAlbum();
                break;
            case ACTIONS.VOLUME_UP: {
                // Clear mute/fade state — user is taking manual control
                state.activeFadeTimer = null;   // generation mismatch cancels any async fade
                state.activeFadeContext = null;
                state.muteRestoreVolume = null;
                const newVol = Math.min(VOLUME.MAX, state.currentVolume + VOLUME.STEP);
                await playbackController.setVolume(newVol);
                break;
            }
            case ACTIONS.VOLUME_DOWN: {
                // Clear mute/fade state — user is taking manual control
                state.activeFadeTimer = null;   // generation mismatch cancels any async fade
                state.activeFadeContext = null;
                state.muteRestoreVolume = null;
                const newVol = Math.max(VOLUME.MIN, state.currentVolume - VOLUME.STEP);
                await playbackController.setVolume(newVol);
                break;
            }
            case ACTIONS.PLAYLIST: {
                const playlistSettings = state.getActionSettings(context) || {};
                const ratingKey = playlistSettings.playlistRatingKey;
                if (!ratingKey) {
                    logger.warn('Playlist button pressed but no playlist configured');
                    break;
                }
                await playbackController.playPlaylist(ratingKey, playlistSettings.playlistShuffle === true);
                break;
            }
        }
        
        // Update displays after action
        setTimeout(() => updateAllDisplays(), 100);
    }

    // ============================================
    // SETTINGS MANAGEMENT
    // ============================================

    async function loadQueueItems(context, { forceRefresh = false, currentRatingKey = null, resetCursor = false } = {}) {
        const containerKey = state.currentContainerKey;
        if (!containerKey || !containerKey.startsWith('/playQueues/')) {
            delete queueItemsCache[context];
            state.setQueueBrowserState(context, { items: [], cursorIndex: 0 });
            state.lastLayoutState[context] = null;
            layoutManager.renderStripLayout(context);
            return;
        }

        // If the same queue is already loaded and we're not forcing a refresh (e.g. mode-switch
        // back to queue), skip the network round-trip and just re-render from cached state.
        const existing = state.getQueueBrowserState(context);
        if (!forceRefresh && queueItemsCache[context] === containerKey && existing?.items?.length > 0) {
            layoutManager.renderStripLayout(context);
            return;
        }

        // Show "Loading..." only when there are no items yet (first-ever load)
        if (!existing?.items?.length) {
            state.setQueueBrowserState(context, { items: [], cursorIndex: 0 });
            layoutManager.renderStripLayout(context);
        }

        const queueID = containerKey.split('/').pop();

        try {
            const result = await plexConnection.fetchPlayQueueItems(containerKey);
            if (!result) throw new Error('No queue data returned');

            const { selectedItemID, items } = result;
            // Find the currently-playing item by selectedItemID first.
            // If the server's selectedItemID hasn't updated yet (happens when a song
            // plays through naturally and we race the server), fall back to matching
            // by the ratingKey we already know from the timeline poll.
            let selectedIdx = items.findIndex(i => i.playQueueItemID === selectedItemID);
            if (currentRatingKey && selectedIdx >= 0 && items[selectedIdx]?.ratingKey !== currentRatingKey) {
                const byRating = items.findIndex(i => i.ratingKey === currentRatingKey);
                if (byRating >= 0) selectedIdx = byRating;
            }
            // "Up next" = only the tracks after the currently playing one, capped for performance
            const upNext = (selectedIdx >= 0 ? items.slice(selectedIdx + 1) : items)
                .slice(0, TIMING.QUEUE_BROWSER_MAX);
            const upNextWithQueueID = upNext.map(i => ({ ...i, queueID }));

            const fresh     = state.getQueueBrowserState(context);
            const newCursor = resetCursor
                ? 0
                : Math.min(fresh?.cursorIndex || 0, Math.max(0, upNextWithQueueID.length - 1));
            state.setQueueBrowserState(context, { items: upNextWithQueueID, cursorIndex: newCursor });
            queueItemsCache[context] = containerKey; // mark as loaded
            logger.info(`Queue browser: loaded ${upNextWithQueueID.length} up-next items`);
        } catch (err) {
            logger.warn(`Failed to load queue items: ${err.message}`);
            state.setQueueBrowserState(context, { items: [], cursorIndex: 0 });
        }

        // Reset layout key so renderQueueBrowser sends a fresh setFeedbackLayout + setFeedback.
        // This is needed after any real fetch (track change, first load) to guarantee the
        // Stream Deck display is updated. Cache-hit calls return early above, so they never
        // reach here and therefore never produce a flash.
        state.lastLayoutState[context] = null;
        layoutManager.renderStripLayout(context);
    }

    async function loadCarouselPlaylists(context) {
        // Initialize with empty state so the strip shows "Loading..."
        if (!state.getCarouselState(context)) {
            state.setCarouselState(context, { playlists: [], index: 0 });
        }
        // Clear poster cache so fresh art is fetched for the new playlist list
        layoutManager.clearCarouselPosterCache();
        layoutManager.renderStripLayout(context);

        try {
            const playlists = await plexConnection.fetchPlaylists();
            const existing = state.getCarouselState(context) || { index: 0 };
            const clamped = Math.min(existing.index, Math.max(0, playlists.length - 1));
            state.setCarouselState(context, { playlists, index: clamped });
            logger.info(`Carousel loaded ${playlists.length} playlists for context`);
        } catch (err) {
            logger.warn(`Failed to load carousel playlists: ${err.message}`);
            state.setCarouselState(context, { playlists: [], index: 0 });
        }

        // Trigger a re-render with the loaded data
        state.lastLayoutState[context] = null;
        layoutManager.renderStripLayout(context);
    }

    function applySettingsToGlobal(_settings) {
        // Connection settings (plexServerUrl, plexToken, clientName, playerUrl) and
        // display preferences (dynamicColors, textColor, debugMode, syncOffset) must
        // only flow from didReceiveGlobalSettings. Per-action settings can hold stale
        // or inconsistent values (e.g. localhost vs LAN IP saved on different buttons)
        // and whichever button loads last would silently overwrite the correct global
        // value. Global settings are the single authoritative source for all of these.
        updateLogLevel();
        configurePlexConnection();
    }

    function updateLogLevel() {
        const debugMode = state.getGlobalSetting('debugMode', false);
        logger.setLevel(debugMode ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
    }

    function configurePlexConnection() {
        const serverUrl = state.getGlobalSetting('plexServerUrl');
        const token = state.getGlobalSetting('plexToken');
        const useLocalPlayer = state.getGlobalSetting('useLocalPlayer', false);
        // When the checkbox is on, always force localhost regardless of auto-discovered URL.
        const playerUrl = useLocalPlayer
            ? PLEX.DEFAULT_PLAYER_URL
            : state.getGlobalSetting('playerUrl');
        
        logger.debug('Configuring Plex connection', {
            hasServer: !!serverUrl,
            hasToken: !!token,
            hasPlayer: !!playerUrl,
            serverUrl: serverUrl || 'none',
            playerUrl: playerUrl || 'none'
        });
        
        if (serverUrl && token) {
            plexConnection.configure(serverUrl, token, playerUrl);
        } else {
            // Clear connection if credentials are removed
            logger.info('Missing credentials - resetting Plex connection');
            plexConnection.reset();
        }
    }

    // ============================================
    // POLLING SYSTEM
    // ============================================

    function startPolling() {
        if (state.pollWorker) return; // Already polling

        const pollWorker = createWorker(TIMING.POLL_INTERVAL);
        const renderWorker = createWorker(TIMING.RENDER_INTERVAL);

        pollWorker.onmessage = () => pollTimeline();
        renderWorker.onmessage = () => renderTick();

        pollWorker.postMessage('start');
        renderWorker.postMessage('start');

        state.setWorkers(pollWorker, renderWorker);

        logger.info('Polling started');
        pollTimeline(); // Initial poll
    }

    function stopPolling() {
        terminateWorker(state.pollWorker);
        terminateWorker(state.renderWorker);
        state.clearWorkers();
        logger.info('Polling stopped');
    }

    async function pollTimeline() {
        if (isPollingInFlight) return;
        isPollingInFlight = true;
        const prevRatingKey = state.lastTimelineRatingKey;
        try {
            const timeline = await plexConnection.fetchTimeline();
            lastSuccessfulPoll = Date.now();
            
            if (timeline && timeline.state === 'stopped') {
                // Plexamp is running but nothing is queued/playing.
                // Use 'idle' so buttons stay lit but track info is cleared.
                // 'stopped' is reserved for Plexamp being unreachable/not running.
                if (state.playbackState !== 'idle') {
                    state.playbackState = 'idle';
                    state.clearTrackInfo();
                    state.lastPositionTimestamp = 0;
                }
            } else if (timeline && timeline.state !== 'stopped') {
                metadataCache.updateFromTimeline(timeline);
                // Refresh queue-browser contexts and reset Plexamp's post-skip internal buffer
                if (timeline.ratingKey !== prevRatingKey) {
                    // If the user kicked tracks while the previous track was playing, Plexamp
                    // may have committed its audio pre-buffer for what USED to come after the
                    // new track (before the kicks). Force a full queue re-read by calling
                    // playMedia with the new track's exact context. Plexamp re-establishes its
                    // queue anchor at the new track and rebuilds its next-track plan from the
                    // now-correct server queue (which already has kicked items removed).
                    if (state.hadRecentKicks && timeline.containerKey) {
                        state.hadRecentKicks = false;
                        // If the kicked track was the pre-buffered next (index 0), jump straight
                        // to the intended replacement (C), not the unavoidably-playing B.
                        const targetKey = state.kickedNextTrackKey || timeline.key;
                        state.kickedNextTrackKey = null;
                        plexConnection.playerCommand(
                            '/player/playback/playMedia',
                            `type=music&key=${encodeURIComponent(targetKey)}&containerKey=${encodeURIComponent(timeline.containerKey)}&offset=0&mediaIndex=0`
                        ).catch(() => {});
                    }

                    state.getAllContexts().forEach(ctx => {
                        const ad = state.getAction(ctx);
                        if (ad?.action !== ACTIONS.STRIP) return;
                        // Always invalidate the cache on track change so that switching to queue
                        // mode from playlist mode always fetches fresh data, not stale items.
                        delete queueItemsCache[ctx];
                        const effectiveMode = state.getActiveDisplayMode(ctx) || state.getActionSettings(ctx)?.displayMode;
                        if (effectiveMode === 'queue') loadQueueItems(ctx, { forceRefresh: true, currentRatingKey: timeline.ratingKey });
                    });
                }
            } else {
                metadataCache.handleNoSession();
            }
        } catch (error) {
            logger.debug(`Timeline poll failed: ${error.message}`);
        } finally {
            isPollingInFlight = false;
        }
    }

    function renderTick() {
        // Watchdog: if polling has gone silent for 10s, restart the cycle
        if (lastSuccessfulPoll > 0 && (Date.now() - lastSuccessfulPoll) > 10000) {
            logger.debug('Poll watchdog triggered — restarting poll cycle');
            lastSuccessfulPoll = Date.now(); // Reset to avoid repeated triggers
            isPollingInFlight = false;       // Clear any stuck in-flight flag
            stopPolling();
            startPolling();
            return;
        }
        updateDisplayPosition();
        updateAllDisplays();
    }

    // ============================================
    // DISPLAY UPDATES
    // ============================================

    function updateDisplayPosition() {
        if (state.playbackState === 'playing' && state.lastPositionTimestamp > 0) {
            const elapsed = Date.now() - state.lastPositionTimestamp;
            const syncOffset = state.getGlobalSetting('syncOffset', 0);
            state.currentPosition = Math.min(
                state.currentPosition + elapsed + syncOffset,
                state.trackDuration
            );
            state.lastPositionTimestamp = Date.now();
        }
        
        state.displayProgress = state.trackDuration > 0
            ? (state.currentPosition / state.trackDuration) * 100
            : 0;
    }

    function updateAllDisplays() {
        state.getAllContexts().forEach(context => {
            updateDisplay(context);
        });
    }

    function updateDisplay(context) {
        const actionData = state.getAction(context);
        if (!actionData) return;
        
        const { action } = actionData;
        
        // Check for active overlay
        if (state.getStripOverlay(context)) {
            return; // Don't update while overlay is showing
        }
        
        // Check if button is actively animating during seek
        const holdState = state.buttonHoldState[context];
        if (holdState && holdState.didSeek && (action === ACTIONS.PREVIOUS || action === ACTIONS.NEXT)) {
            return; // Don't interrupt seek animation
        }
        
        switch (action) {
            case ACTIONS.ALBUM_ART:
                buttonRenderer.renderAlbumArt(context);
                break;
            case ACTIONS.PLAY_PAUSE:
                buttonRenderer.renderPlayPause(context);
                break;
            case ACTIONS.PREVIOUS:
                buttonRenderer.renderPrevious(context);
                break;
            case ACTIONS.NEXT:
                buttonRenderer.renderNext(context);
                break;
            case ACTIONS.INFO:
                buttonRenderer.renderInfo(context);
                break;
            case ACTIONS.TIME:
                buttonRenderer.renderTime(context);
                break;
            case ACTIONS.RATING:
                buttonRenderer.renderRating(context);
                break;
            case ACTIONS.SHUFFLE:
                buttonRenderer.renderShuffle(context);
                break;
            case ACTIONS.REPEAT:
                buttonRenderer.renderRepeat(context);
                break;
            case ACTIONS.STRIP:
                layoutManager.renderStripLayout(context);
                break;
            case ACTIONS.VOLUME_UP:
                buttonRenderer.renderVolumeUp(context);
                break;
            case ACTIONS.VOLUME_DOWN:
                buttonRenderer.renderVolumeDown(context);
                break;
            case ACTIONS.PLAYLIST:
                buttonRenderer.renderPlaylist(context);
                break;
            case ACTIONS.TRACK_TITLE:
                buttonRenderer.renderTrackTitle(context);
                break;
            case ACTIONS.SKIP_ALBUM:
                buttonRenderer.renderSkipAlbum(context);
                break;
            case ACTIONS.PREV_ALBUM:
                buttonRenderer.renderPrevAlbum(context);
                break;
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    logger.info(`Ampdeck+ v${VERSION} module loaded`);

    // Expose globally for Stream Deck
    if (typeof window !== 'undefined') {
        window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
        window.pollTimeline = pollTimeline;
    }

})();
