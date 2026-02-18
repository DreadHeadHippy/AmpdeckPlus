(function () {
    'use strict';

    /**
     * Application Constants
     * Centralized configuration values
     */

    // Version
    const VERSION = '2.0.0';

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
        STRIP: 'com.dreadheadhippy.ampdeckplus.strip'
    };

    // Timing constants
    const TIMING = {
        POLL_INTERVAL: 1000,           // Timeline poll rate (ms)
        RENDER_INTERVAL: 200,          // Display update rate (ms)
        HOLD_THRESHOLD: 400,           // Press duration for hold action (ms)
        SEEK_INTERVAL: 200,            // Seek repeat rate when holding (ms)
        SEEK_AMOUNT: 10000,            // Seek distance per step (ms)
        RECONNECT_DELAY: 3000,         // WebSocket reconnect delay (ms)
        RECONNECT_MAX_DELAY: 30000     // Maximum reconnect delay (ms)
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
        MAX: 100
    };

    // Rating
    const RATING = {
        HALF_STAR: 1,
        FULL_STAR: 2,
        MAX: 10
    };

    // Colors
    const COLORS = {
        DEFAULT: '#E5A00D',            // Fallback accent color
        BLACK: '#000000',
        DARK_GRAY: '#333333',
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
        }

        setLevel(level) {
            this.currentLevel = level;
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

            // Rating cache (handles Plex metadata delays)
            this.userSetRatings = {}; // ratingKey -> rating value

            // UI state
            this.lastLayoutState = {};       // context -> layout key
            this.stripOverlays = {};         // context -> overlay state
            this.stripScrollState = {};      // context -> scroll state
            this.buttonHoldState = {};       // context -> hold state

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
     * @param {string} mode - 'half' for half-star increments, 'full' for full stars only
     * @returns {string} Star characters (★ = full, ⯨ = half, ☆ = empty)
     */
    function formatRating(rating, mode) {
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
        }

        /**
         * Configure connection settings
         */
        configure(serverUrl, token, playerUrl = null) {
            this.serverUrl = serverUrl;
            this.token = token;
            if (playerUrl) {
                this.playerUrl = playerUrl;
            }
            logger.info('Plex connection configured', {
                server: serverUrl,
                player: this.playerUrl
            });
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
         * Execute command on local player (with server fallback)
         */
        async playerCommand(path, extraParams = null) {
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

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(false)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                logger.debug(`Player command success: ${path}`);
                return response;
            } catch (error) {
                logger.warn(`Player command failed (${path}): ${error.message}, falling back to server`);
                return this.serverCommand(path, extraParams);
            }
        }

        /**
         * Execute command via Plex server
         */
        async serverCommand(path, extraParams = null) {
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

            try {
                const response = await fetch(url, {
                    headers: this.createHeaders(true)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                logger.debug(`Server command success: ${path}`);
                return response;
            } catch (error) {
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
         * Fetch timeline from local player
         */
        async fetchTimeline() {
            if (!this.token || !this.serverUrl) {
                return null;
            }

            const params = new URLSearchParams({
                commandID: state.getNextCommandID(),
                'X-Plex-Token': this.token
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
         */
        async fetchAlbumArt(thumbPath, serverUrl = null, token = null) {
            const url = `${serverUrl || this.serverUrl}${thumbPath}`;
            const authToken = token || this.token;

            logger.debug(`Fetching album art: ${thumbPath}`);

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
        async setVolume(level) {
            const volume = clamp(level, VOLUME.MIN, VOLUME.MAX);
            
            try {
                await plexConnection.playerCommand(
                    '/player/playback/setParameters',
                    `volume=${volume}`
                );
                
                state.currentVolume = volume;
                logger.debug(`Volume set to ${volume}`);
            } catch (error) {
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
            
            try {
                await plexConnection.playerCommand(
                    '/player/playback/setParameters',
                    `shuffle=${newShuffle}`
                );
                
                state.currentShuffle = newShuffle;
                logger.debug(`Shuffle ${newShuffle ? 'enabled' : 'disabled'}`);
            } catch (error) {
                logger.error(`Failed to toggle shuffle: ${error.message}`);
            }
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
         */
        async setRating(rating) {
            if (!state.currentTrack?.ratingKey) {
                logger.warn('Cannot set rating: no current track');
                return;
            }

            const ratingKey = state.currentTrack.ratingKey;
            
            try {
                await plexConnection.serverCommand(
                    `/:/rate`,
                    `key=${ratingKey}&identifier=com.plexapp.plugins.library&rating=${rating}`
                );
                
                // Cache the user-set rating
                state.setUserRating(ratingKey, rating);
                state.currentRating = rating;
                
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
            state.currentVolume = timelineData.volume || 50;
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

                // Load album track count if needed
                if (metadata.parentRatingKey && 
                    metadata.parentRatingKey !== state.lastParentRatingKey) {
                    
                    state.lastParentRatingKey = metadata.parentRatingKey;
                    const count = await plexConnection.fetchAlbumTrackCount(metadata.parentRatingKey);
                    state.albumTrackCount = count;
                }

                // Load album art if changed
                const artPath = metadata.thumb || metadata.parentThumb || metadata.grandparentThumb;
                if (artPath && artPath !== state.lastArtPath) {
                    state.lastArtPath = artPath;
                    await this.loadAlbumArt(artPath);
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

        const isPaused = state.playbackState === 'paused';

        if (state.currentAlbumArt) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);
                
                // Apply gray overlay when paused
                if (isPaused) {
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
     * Render play/pause button
     */
    function renderPlayPause(context) {
        const canvas = createCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

        const textColor = getTextColor$1();

        if (state.playbackState === 'stopped') {
            ctx.fillStyle = COLORS.DARK_GRAY;
            ctx.beginPath();
            ctx.moveTo(50, 42);
            ctx.lineTo(110, 72);
            ctx.lineTo(50, 102);
            ctx.closePath();
            ctx.fill();
        } else if (state.playbackState === 'playing') {
            ctx.fillStyle = textColor;
            ctx.fillRect(45, 42, 18, 60);
            ctx.fillRect(81, 42, 18, 60);
        } else {
            ctx.fillStyle = textColor;
            ctx.beginPath();
            ctx.moveTo(50, 42);
            ctx.lineTo(110, 72);
            ctx.lineTo(50, 102);
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

        const isPaused = state.playbackState === 'paused';
        const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();

        if (state.currentTrack) {
            const media = state.currentTrack.Media?.[0];
            const format = media?.audioCodec ? media.audioCodec.toUpperCase() : '---';
            const bitrate = media?.bitrate ? `${Math.round(media.bitrate)} kbps` : '';
            const trackNum = state.currentTrack.index || '?';
            const totalTracks = state.albumTrackCount || '?';

            // Symmetrical spacing: format, bitrate, label, track number
            const formatSize = 36;
            const bitrateSize = 26;
            const labelSize = 24;
            const trackSize = 42;
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

            // Track number (e.g., 3/12)
            ctx.font = `bold ${trackSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText(`${trackNum}/${totalTracks}`, 72, gap + formatSize + gap + bitrateSize + gap + labelSize + gap + trackSize / 2);
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

        const isPaused = state.playbackState === 'paused';
        const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();

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
            
            // Current position
            ctx.font = `bold ${timeSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.fillText(formatTime(state.currentPosition), 72, timeY);

            // Duration
            ctx.font = `bold ${durationSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText('/ ' + formatTime(state.trackDuration), 72, durationY);

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
        
        const isPaused = state.playbackState === 'paused';
        const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor$1();
        const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();

        if (state.currentTrack) {
            // Display "RATING" label at top
            ctx.textAlign = "center";
            ctx.font = "bold 26px sans-serif";
            ctx.fillStyle = textColor;
            ctx.fillText("RATING", 72, 32);

            // Display rating based on style preference
            const hasHalfStar = state.currentRating % 2 === 1;
            let numericRating;
            
            if (displayStyle === "stars") {
                // Stars only
                const stars = formatRating(state.currentRating, ratingMode);
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.fillStyle = accentColor;
                ctx.fillText(stars, 72, 90);
            } else if (displayStyle === "numeric") {
                // Numeric only (e.g., "4.5" or "4")
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = accentColor;
                if (state.currentRating === 0) {
                    ctx.fillText("0", 72, 90);
                } else {
                    numericRating = hasHalfStar ? (state.currentRating / 2).toFixed(1) : (state.currentRating / 2).toString();
                    ctx.fillText(numericRating, 72, 90);
                }
            } else {
                // Both - numeric with scale (e.g., "4.5/5" or "4/5")
                ctx.font = "bold " + fontSize + "px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = accentColor;
                if (state.currentRating === 0) {
                    ctx.fillText("0/5", 72, 90);
                } else {
                    numericRating = hasHalfStar ? (state.currentRating / 2).toFixed(1) : (state.currentRating / 2).toString();
                    ctx.fillText(numericRating + "/5", 72, 90);
                }
            }
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

        const isPaused = state.playbackState === 'paused';
        const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();
        const isOn = state.currentShuffle === 1;
        const iconColor = (isPaused || !isOn) ? COLORS.DARK_GRAY : COLORS.WHITE;

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

        // State label - dynamic color
        if (isOn) {
            ctx.fillStyle = accentColor;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ON', 72, 130);
        }
        
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

        const isPaused = state.playbackState === 'paused';
        const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();
        const isOn = state.currentRepeat > 0;
        const iconColor = (isPaused || !isOn) ? COLORS.DARK_GRAY : COLORS.WHITE;

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
            ctx.fillStyle = '#999999';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('1', 70, 78);
        }

        // State label - dynamic color
        // Plex API: 1=One, 2=All
        if (state.currentRepeat === 2) {
            ctx.fillStyle = accentColor;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ALL', 72, 128);
        } else if (state.currentRepeat === 1) {
            ctx.fillStyle = accentColor;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ONE', 72, 128);
        }
        
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
        const iconSize = parseInt(settings.navigationIconSize) || 40;
        const isPaused = state.playbackState === 'paused';
        const iconColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();

        // Calculate animation offset (starts at center, moves left, wraps from right)
        let offsetX = 0;
        if (animationFrame !== null) {
            const speed = 20; // pixels per frame
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
        const iconSize = parseInt(settings.navigationIconSize) || 40;
        const isPaused = state.playbackState === 'paused';
        const iconColor = isPaused ? COLORS.DARK_GRAY : getAccentColor$1();

        // Calculate animation offset (starts at center, moves right, wraps from left)
        let offsetX = 0;
        if (animationFrame !== null) {
            const speed = 20; // pixels per frame
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
     * Send image to Stream Deck
     */
    function sendImage(context, dataUrl) {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({
                event: 'setImage',
                context: context,
                payload: { image: dataUrl, target: 0 }
            }));
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
        renderRepeat
    };

    /**
     * Layout Manager
     * Handles touch strip layouts, scrolling text, and feedback
     */


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
        const settings = state.getActionSettings(context);
        const displayMode = settings.displayMode || 'artist';
        const fontSize = parseInt(settings.fontSize) || 16;
        const totalPanels = parseInt(settings.progressTotalPanels) || 3;
        const position = parseInt(settings.progressPosition) || 1;

        const textColor = settings.textColor || getTextColor();
        const accentColor = getAccentColor();
        const stripSecondary = getSecondaryColor(textColor);

        let label = '', text = '';
        if (state.currentTrack) {
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
        const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, accentColor);

        const pausedDim = state.playbackState === 'paused';
        const labelColor = pausedDim ? stripSecondary : textColor;
        const textDisplayColor = pausedDim ? stripSecondary : textColor;

        // Always use pixmap for displayText for consistent rendering
        const textAreaH = fontSize + 8;
        
        // Calculate symmetrical spacing
        const stripHeight = 100;
        const progressBarHeight = 4;
        const labelHeight = labelSize + 4;
        const contentHeight = labelHeight + textAreaH + progressBarHeight;
        const totalGap = stripHeight - contentHeight;
        const gap = totalGap / 4; // Equal spacing: top, between label & text, between text & progress, bottom
        
        const labelY = gap;
        const textY = gap + labelHeight + gap;
        const progressY = textY + textAreaH + gap;
        
        const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}`;
        
        if (state.lastLayoutState[context] !== layoutKey) {
            state.lastLayoutState[context] = layoutKey;
            setFeedbackLayout(context, {
                id: 'com.dreadheadhippy.ampdeckplus.layout',
                items: [
                    {
                        key: 'label',
                        type: 'text',
                        rect: [0, labelY, 200, labelHeight],
                        font: { size: labelSize, weight: 700 },
                        color: labelColor,
                        alignment: 'center'
                    },
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
                ]
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

        setFeedback(context, {
            label: label,
            displayText: textImage,
            progressBar: progressBar
        });
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
        canvas.height = 4;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = COLORS.DARK_GRAY;
        ctx.fillRect(0, 0, 200, 4);

        if (position > 0 && position <= totalPanels) {
            const segSize = 100 / totalPanels;
            const segStart = (position - 1) * segSize;
            const segEnd = position * segSize;
            
            if (progress > segStart) {
                const progressInSeg = Math.min(progress, segEnd) - segStart;
                const fillWidth = Math.round((progressInSeg / segSize) * 200);
                if (fillWidth > 0) {
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, fillWidth, 4);
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
            // Two-line display with symmetrical spacing - larger text for better visibility
            const titleSize = 24;
            const subtitleSize = 44;
            const totalContent = titleSize + subtitleSize;
            const gap = (100 - totalContent) / 3; // Equal spacing: top, middle, bottom
            
            const titleY = gap + titleSize / 2;
            const subtitleY = gap + titleSize + gap + subtitleSize / 2;
            
            ctx.font = `bold ${titleSize}px sans-serif`;
            ctx.fillText(title, 100, titleY);
            ctx.font = `bold ${subtitleSize}px sans-serif`;
            ctx.fillText(subtitle, 100, subtitleY);
        } else {
            // Single line display - vertically centered with larger text
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(title, 100, 50);
        }

        const overlayImage = canvas.toDataURL('image/png');

        // Send full overlay layout
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

        // Set new timer - resets the countdown on each dial rotation
        const timer = setTimeout(() => {
            state.clearStripOverlay(context);
            state.lastLayoutState[context] = null;
            renderStripLayout(context);
        }, 1500);

        // Store overlay with timer reference
        state.setStripOverlay(context, {
            title: title,
            subtitle: subtitle,
            timer: timer
        });

        logger.debug(`Overlay shown: ${title}${subtitle ? ' - ' + subtitle : ''}`);
    }

    /**
     * Send feedback layout to Stream Deck
     */
    function setFeedbackLayout(context, layout) {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({
                event: 'setFeedbackLayout',
                context: context,
                payload: { layout: layout }
            }));
        }
    }

    /**
     * Send feedback to Stream Deck
     */
    function setFeedback(context, payload) {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({
                event: 'setFeedback',
                context: context,
                payload: payload
            }));
        }
    }

    var layoutManager = {
        renderStripLayout,
        showStripOverlay
    };

    /**
     * Ampdeck+ v2.0.0
     * Professional Stream Deck Plugin for Plexamp
     * Modular architecture with automatic reconnection
     */


    // Connection manager
    let connection = null;

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
        
        // Store connection in state for button renderers
        state.pluginUUID = inPluginUUID;
        state.websocket = connection.websocket;
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
            case 'touchTap':
                onTouchTap(data);
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
        applySettingsToGlobal(settings);
        startPolling();
        
        // Initial render
        updateDisplay(context);
        
        logger.debug(`Action appeared: ${action}`);
    }

    function onWillDisappear(data) {
        const { context } = data;
        
        // Clean up hold state
        if (state.buttonHoldState[context]) {
            clearInterval(state.buttonHoldState[context].seekInterval);
            delete state.buttonHoldState[context];
        }
        
        state.removeAction(context);
        
        if (!state.hasActions()) {
            stopPolling();
        }
        
        logger.debug(`Action disappeared`);
    }

    function onDidReceiveGlobalSettings(data) {
        const settings = data.payload.settings || {};
        state.updateGlobalSettings(settings);
        updateLogLevel();
        configurePlexConnection();
        
        logger.debug('Global settings received');
        
        // Start polling if configured
        if (settings.plexToken && settings.plexServerUrl) {
            pollTimeline();
        }
    }

    function onDidReceiveSettings(data) {
        const { context } = data;
        const settings = data.payload.settings || {};
        
        state.updateActionSettings(context, settings);
        applySettingsToGlobal(settings);
        saveGlobalSettings();
        
        // Reset layout to force refresh
        state.lastLayoutState[context] = null;
        
        updateDisplayPosition();
        updateAllDisplays();
        
        logger.debug('Action settings received');
    }

    function onKeyDown(data) {
        const { context, action } = data;
        
        // Track button hold for seek functionality
        state.buttonHoldState[context] = {
            pressTime: Date.now(),
            action: action,
            seekInterval: null,
            didSeek: false
        };

        // Start hold-to-seek timer for prev/next
        if (action === ACTIONS.PREVIOUS || action === ACTIONS.NEXT) {
            setTimeout(() => {
                const holdState = state.buttonHoldState[context];
                if (holdState && !holdState.didSeek) {
                    holdState.didSeek = true;
                    holdState.animationFrame = 0;
                    const direction = action === ACTIONS.PREVIOUS ? -1 : 1;
                    
                    // Track target position locally to avoid stale state.currentPosition
                    holdState.targetPosition = state.currentPosition;
                    
                    // Perform first seek
                    holdState.targetPosition += direction * TIMING.SEEK_AMOUNT;
                    playbackController.seekTo(Math.max(0, Math.min(holdState.targetPosition, state.trackDuration)));
                    
                    // Animate button
                    if (action === ACTIONS.PREVIOUS) {
                        buttonRenderer.renderPrevious(context, 0);
                    } else {
                        buttonRenderer.renderNext(context, 0);
                    }
                    
                    // Continue seeking while held  
                    holdState.seekInterval = setInterval(() => {
                        const hs = state.buttonHoldState[context];
                        if (hs && hs.targetPosition !== undefined) {
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
                            
                            // Only seek if we're not at a boundary
                            if (clampedPos === hs.targetPosition) {
                                playbackController.seekTo(clampedPos);
                            } else {
                                // Hit boundary, stop seeking
                                clearInterval(hs.seekInterval);
                                hs.seekInterval = null;
                                // Reset button to normal state
                                if (action === ACTIONS.PREVIOUS) {
                                    buttonRenderer.renderPrevious(context);
                                } else {
                                    buttonRenderer.renderNext(context);
                                }
                            }
                        }
                    }, TIMING.SEEK_INTERVAL);
                }
            }, TIMING.HOLD_THRESHOLD);
        }
    }

    function onKeyUp(data) {
        const { context,action } = data;
        const holdState = state.buttonHoldState[context];
        
        if (!holdState) return;
        
        // Stop seeking interval
        if (holdState.seekInterval) {
            clearInterval(holdState.seekInterval);
        }
        
        // If we were seeking, don't execute the button action
        if (holdState.didSeek) {
            // Reset button to normal state
            if (action === ACTIONS.PREVIOUS) {
                buttonRenderer.renderPrevious(context);
            } else if (action === ACTIONS.NEXT) {
                buttonRenderer.renderNext(context);
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
        
        // Handle dial rotation based on user's configured action
        if (dialAction === 'skip') {
            if (ticks > 0) {
                playbackController.skipNext();
                layoutManager.showStripOverlay(context, 'NEXT', '▶▶');
            } else if (ticks < 0) {
                playbackController.skipPrevious();
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
            const step = ratingMode === 'half' ? RATING.HALF_STAR : RATING.FULL_STAR;
            const newRating = Math.max(0, Math.min(10, state.currentRating + (ticks * step)));
            
            // Update rating locally immediately
            state.currentRating = newRating;
            
            // Cache this rating for this track
            if (state.currentTrack?.ratingKey) {
                state.setUserRating(state.currentTrack.ratingKey, newRating);
            }
            
            // Show overlay with stars
            const stars = formatRating(newRating, ratingMode);
            layoutManager.showStripOverlay(context, 'RATING', stars);
            
            // Debounce: save rating after 2 seconds of inactivity
            if (state.ratingSaveTimer) {
                clearTimeout(state.ratingSaveTimer);
            }
            
            state.ratingSaveTimer = setTimeout(() => {
                playbackController.setRating(newRating);
                state.ratingSaveTimer = null;
            }, 2000);
        }
    }

    function onDialDown(data) {
        const { context } = data;
        const action = state.getAction(context)?.action;
        
        if (action === ACTIONS.STRIP) {
            playbackController.togglePlayPause();
        }
    }

    function onTouchTap(data) {
        const { context } = data;
        const action = state.getAction(context)?.action;
        
        if (action !== ACTIONS.STRIP) return;
        
        // Tap anywhere on touch strip to play/pause
        playbackController.togglePlayPause();
    }

    // ============================================
    // BUTTON ACTIONS
    // ============================================

    async function handleButtonAction(action, context) {
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
                break;
            case ACTIONS.PREVIOUS:
                await playbackController.skipPrevious();
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
                const step = ratingMode === 'half' ? RATING.HALF_STAR : RATING.FULL_STAR;
                
                // Calculate new rating with wrap-around at max
                let newRating = state.currentRating + step;
                if (newRating > RATING.MAX) {
                    newRating = 0; // Wrap to 0
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
                
                state.ratingSaveTimer = setTimeout(() => {
                    playbackController.setRating(newRating);
                    state.ratingSaveTimer = null;
                }, 2000);
                break;
        }
        
        // Update displays after action
        setTimeout(() => updateAllDisplays(), 100);
    }

    // ============================================
    // SETTINGS MANAGEMENT
    // ============================================

    function applySettingsToGlobal(settings) {
        if (settings.plexServerUrl) state.updateGlobalSettings({ plexServerUrl: settings.plexServerUrl });
        if (settings.plexToken) state.updateGlobalSettings({ plexToken: settings.plexToken });
        if (settings.clientName) state.updateGlobalSettings({ clientName: settings.clientName });
        if (settings.playerUrl) state.updateGlobalSettings({ playerUrl: settings.playerUrl });
        if (settings.syncOffset !== undefined) state.updateGlobalSettings({ syncOffset: settings.syncOffset });
        if (settings.textColor) state.updateGlobalSettings({ textColor: settings.textColor });
        if (settings.dynamicColors !== undefined) state.updateGlobalSettings({ dynamicColors: settings.dynamicColors });
        if (settings.debugMode !== undefined) state.updateGlobalSettings({ debugMode: settings.debugMode });
        
        updateLogLevel();
        configurePlexConnection();
    }

    function saveGlobalSettings() {
        if (connection && connection.isConnected()) {
            connection.send({
                event: 'setGlobalSettings',
                context: state.pluginUUID,
                payload: state.globalSettings
            });
        }
    }

    function updateLogLevel() {
        const debugMode = state.getGlobalSetting('debugMode', false);
        logger.setLevel(debugMode ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
    }

    function configurePlexConnection() {
        const serverUrl = state.getGlobalSetting('plexServerUrl');
        const token = state.getGlobalSetting('plexToken');
        const playerUrl = state.getGlobalSetting('playerUrl');
        
        if (serverUrl && token) {
            plexConnection.configure(serverUrl, token, playerUrl);
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
        try {
            const timeline = await plexConnection.fetchTimeline();
            
            if (timeline && timeline.state !== 'stopped') {
                metadataCache.updateFromTimeline(timeline);
            } else {
                metadataCache.handleNoSession();
            }
        } catch (error) {
            logger.debug(`Timeline poll failed: ${error.message}`);
        }
    }

    function renderTick() {
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
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    logger.info(`Ampdeck+ v${VERSION} module loaded`);

    // Expose globally for Stream Deck
    if (typeof window !== 'undefined') {
        window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
    }

})();
