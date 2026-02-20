/**
 * Application Constants
 * Centralized configuration values
 */

// Version
export const VERSION = '2.0.1';

// Action identifiers
export const ACTIONS = {
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
export const TIMING = {
    POLL_INTERVAL: 1000,           // Timeline poll rate (ms)
    RENDER_INTERVAL: 200,          // Display update rate (ms)
    HOLD_THRESHOLD: 400,           // Press duration for hold action (ms)
    SEEK_INTERVAL: 500,            // Seek repeat rate when holding (ms) - increased to prevent queue overflow when Stream Deck is in tray
    SEEK_AMOUNT: 10000,            // Seek distance per step (ms)
    RATING_SAVE_DELAY: 1500,      // Debounce delay for rating saves (ms)
    SCROLL_PAUSE: 2000,            // Pause before scrolling text (ms)
    RECONNECT_DELAY: 3000,         // WebSocket reconnect delay (ms)
    RECONNECT_MAX_DELAY: 30000     // Maximum reconnect delay (ms)
};

// Scrolling text
export const SCROLL = {
    SPEED: 30,                     // Pixels per second
    GAP: 40,                       // Gap between repeat (px)
    PAUSE: 2000                    // Pause at start/end (ms)
};

// Volume
export const VOLUME = {
    STEP: 5,                       // Volume change per step
    MIN: 0,
    MAX: 100
};

// Rating
export const RATING = {
    HALF_STAR: 1,
    FULL_STAR: 2,
    MIN: 0,
    MAX: 10
};

// Colors
export const COLORS = {
    DEFAULT: '#E5A00D',            // Fallback accent color
    BLACK: '#000000',
    DARK_GRAY: '#333333',
    MEDIUM_GRAY: '#777777',
    LIGHT_GRAY: '#999999',
    WHITE: '#FFFFFF'
};

// Canvas sizes
export const CANVAS = {
    BUTTON_SIZE: 144,
    STRIP_WIDTH: 200
};

// Plex defaults
export const PLEX = {
    DEFAULT_PLAYER_URL: 'http://localhost:32500',
    CLIENT_IDENTIFIER: 'com.dreadheadhippy.ampdeckplus',
    PROTOCOL_VERSION: '1.0'
};

// Logging
export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

export const MAX_LOG_ENTRIES = 500;
