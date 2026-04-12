/**
 * Playback Controller
 * High-level playback control functions
 */

import { VOLUME } from '../core/constants.js';
import { clamp } from '../utils/helpers.js';
import state from '../core/stateManager.js';
import plexConnection from './plexConnection.js';
import logger from '../utils/logger.js';

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

export default playbackController;
