/**
 * Button Renderer
 * Canvas-based rendering for Stream Deck buttons
 */

import { CANVAS, COLORS } from '../core/constants.js';
import { formatTime, formatRating } from '../utils/helpers.js';
import state from '../core/stateManager.js';

/**
 * Get configured text color
 */
function getTextColor() {
    return state.getGlobalSetting('textColor') || COLORS.WHITE;
}

/**
 * Get accent color (uses dominant color if dynamic colors enabled)
 */
function getAccentColor() {
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
export function renderAlbumArt(context) {
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
export function renderPlayPause(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const textColor = getTextColor();

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
export function renderInfo(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const isPaused = state.playbackState === 'paused';
    const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();

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
export function renderTime(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const isPaused = state.playbackState === 'paused';
    const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();

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
export function renderRating(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const settings = state.getActionSettings(context) || {};
    const fontSize = parseInt(settings.ratingFontSize) || 48;
    const ratingMode = settings.ratingMode || "half";
    const displayStyle = settings.ratingDisplay || "stars";
    
    const isPaused = state.playbackState === 'paused';
    const textColor = isPaused ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();

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
export function renderShuffle(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const isPaused = state.playbackState === 'paused';
    const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();
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
export function renderRepeat(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const isPaused = state.playbackState === 'paused';
    const accentColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();
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
export function renderPrevious(context, animationFrame = null) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const settings = state.getActionSettings(context) || {};
    const iconSize = parseInt(settings.navigationIconSize) || 40;
    const isPaused = state.playbackState === 'paused';
    const iconColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();

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
export function renderNext(context, animationFrame = null) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const settings = state.getActionSettings(context) || {};
    const iconSize = parseInt(settings.navigationIconSize) || 40;
    const isPaused = state.playbackState === 'paused';
    const iconColor = isPaused ? COLORS.DARK_GRAY : getAccentColor();

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

export default {
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
