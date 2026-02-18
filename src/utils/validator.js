/**
 * Input Validator
 * Validates user input for settings
 */

import logger from './logger.js';

/**
 * Validate Plex server URL
 */
export function validateServerUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'Server URL is required' };
    }

    const trimmed = url.trim();
    
    // Check protocol
    if (!trimmed.match(/^https?:\/\//i)) {
        return { valid: false, error: 'URL must start with http:// or https://' };
    }

    // Try parsing as URL
    try {
        const parsed = new URL(trimmed);
        
        // Check for valid hostname
        if (!parsed.hostname) {
            return { valid: false, error: 'Invalid hostname' };
        }

        // Warn about IP addresses without HTTPS
        if (parsed.protocol === 'http:' && parsed.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            logger.warn('Using HTTP with IP address - consider HTTPS for security');
        }

        return { valid: true, url: trimmed };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format: ' + e.message };
    }
}

/**
 * Validate Plex auth token
 */
export function validatePlexToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Plex token is required' };
    }

    const trimmed = token.trim();
    
    // Plex tokens are typically 20 characters, alphanumeric
    if (trimmed.length < 10) {
        return { valid: false, error: 'Token appears too short (expected 20+ characters)' };
    }

    if (!trimmed.match(/^[a-zA-Z0-9_-]+$/)) {
        return { valid: false, error: 'Token contains invalid characters' };
    }

    return { valid: true, token: trimmed };
}

/**
 * Validate player URL
 */
export function validatePlayerUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'Player URL is required' };
    }

    const trimmed = url.trim();
    
    if (!trimmed.match(/^https?:\/\//i)) {
        return { valid: false, error: 'URL must start with http:// or https://' };
    }

    try {
        const parsed = new URL(trimmed);
        
        if (!parsed.hostname) {
            return { valid: false, error: 'Invalid hostname' };
        }

        // Player URL should typically be localhost
        if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            logger.warn(`Player URL is not localhost: ${parsed.hostname} - this may not work correctly`);
        }

        return { valid: true, url: trimmed };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format: ' + e.message };
    }
}

/**
 * Validate client name
 */
export function validateClientName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: true, name: 'Ampdeck+' }; // Use default
    }

    const trimmed = name.trim();
    
    if (trimmed.length > 50) {
        return { valid: false, error: 'Client name too long (max 50 characters)' };
    }

    return { valid: true, name: trimmed };
}

/**
 * Validate color hex code
 */
export function validateColor(color) {
    if (!color || typeof color !== 'string') {
        return { valid: false, error: 'Color is required' };
    }

    const trimmed = color.trim();
    
    if (!trimmed.match(/^#[0-9A-Fa-f]{6}$/)) {
        return { valid: false, error: 'Color must be in #RRGGBB format' };
    }

    return { valid: true, color: trimmed };
}

/**
 * Validate numeric offset (for sync)
 */
export function validateOffset(offset) {
    const num = Number(offset);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Offset must be a number' };
    }

    if (num < -10000 || num > 10000) {
        return { valid: false, error: 'Offset must be between -10000 and 10000' };
    }

    return { valid: true, offset: num };
}
