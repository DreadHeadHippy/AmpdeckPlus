/**
 * Metadata Cache
 * Handles metadata loading and rating cache management
 */

import state from '../core/stateManager.js';
import plexConnection from './plexConnection.js';
import logger from '../utils/logger.js';

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
        // Only accept volume from timeline if no recent local command (avoids race condition
        // and also fixes 0 || 50 falsy bug by using nullish coalescing)
        const timeSinceVolumeCommand = Date.now() - state.lastVolumeCommandTime;
        if (timeSinceVolumeCommand > 2000) {
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

export default metadataCache;
