/**
 * Ampdeck+ v2.0.0
 * Professional Stream Deck Plugin for Plexamp
 * Modular architecture with automatic reconnection
 */

import { VERSION, ACTIONS, TIMING, LOG_LEVELS, RATING, VOLUME } from './core/constants.js';
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
