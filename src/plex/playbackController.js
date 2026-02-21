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
        const previousVolume = state.currentVolume;
        
        // Optimistic update + guard so timeline doesn't overwrite us mid-flight
        state.currentVolume = volume;
        state.lastVolumeCommandTime = Date.now();
        
        try {
            await plexConnection.playerCommand(
                '/player/playback/setParameters',
                `volume=${volume}`
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
}

// Singleton instance
const playbackController = new PlaybackController();

export default playbackController;
