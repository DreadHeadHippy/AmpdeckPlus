/**
 * Ampdeck+ v2.0.0
 * Professional Stream Deck Plugin for Plexamp
 * Modular architecture with automatic reconnection
 */

import { VERSION, ACTIONS, TIMING, LOG_LEVELS, RATING, VOLUME, PLEX } from './core/constants.js';
import ConnectionManager from './core/connectionManager.js';
import state from './core/stateManager.js';
import logger from './utils/logger.js';
import { createWorker, terminateWorker, formatRating } from './utils/helpers.js';
import plexConnection from './plex/plexConnection.js';
import playbackController from './plex/playbackController.js';
import metadataCache from './plex/metadataCache.js';
import buttonRenderer from './ui/buttonRenderer.js';
import layoutManager from './ui/layoutManager.js';

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
    applySettingsToGlobal(settings);
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
    applySettingsToGlobal(settings);
    
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
