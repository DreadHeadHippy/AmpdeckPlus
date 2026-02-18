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

        // Create AbortController with 1 second timeout to prevent hanging connections
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);

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

export default plexConnection;
