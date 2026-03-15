/**
 * Plex Connection
 * Handles communication with Plex player (local) and server (remote)
 */ 

import { PLEX } from '../core/constants.js';
import state from '../core/stateManager.js';
import logger from '../utils/logger.js';

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
    async playerCommand(path, extraParams = null, timeoutMs = 1000) {
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

export default plexConnection;
