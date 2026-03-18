/**
 * Button Renderer
 * Canvas-based rendering for Stream Deck buttons
 */

import { CANVAS, COLORS, RATING } from '../core/constants.js';
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

    const isDimmed = state.playbackState === 'stopped';

    if (state.currentAlbumArt) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);
            
            // Apply gray overlay when paused or stopped
            if (isDimmed) {
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
 * Render play/pause button.
 *
 * Draws the play triangle when paused/stopped, or two pause bars when playing.
 * Follows the same dimming logic as all other buttons.
 *
 * Play triangle:  (50,42) → (110,72) tip → (50,102)
 * Pause bars:     left x:45–63 y:42–102   right x:81–99 y:42–102
 *
 * @param {string} context - Stream Deck button context
 */
export function renderPlayPause(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, CANVAS.BUTTON_SIZE, CANVAS.BUTTON_SIZE);

    const isDimmed = state.playbackState === 'stopped';
    ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

    const settings = state.getActionSettings(context) || {};
    const iconSize = parseInt(settings.playPauseIconSize) || 60;
    const half = iconSize / 2;
    const cx = CANVAS.BUTTON_SIZE / 2;
    const cy = CANVAS.BUTTON_SIZE / 2;
    const top = cy - half;

    if (state.playbackState === 'playing') {
        // Two pause bars, proportional to iconSize
        const barWidth = Math.round(iconSize * 0.3);
        const barGap   = Math.round(iconSize * 0.3);
        const leftX    = Math.round(cx - barWidth - barGap / 2);
        const rightX   = Math.round(cx + barGap / 2);
        ctx.fillRect(leftX,  top, barWidth, iconSize);
        ctx.fillRect(rightX, top, barWidth, iconSize);
    } else {
        // Play triangle, centered
        ctx.beginPath();
        ctx.moveTo(cx - half, top);
        ctx.lineTo(cx + half, cy);
        ctx.lineTo(cx - half, top + iconSize);
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

    const isDimmed = state.playbackState === 'stopped';
    const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

    if (state.currentTrack) {
        const media = state.currentTrack.Media?.[0];
        const format = media?.audioCodec ? media.audioCodec.toUpperCase() : '---';
        const bitrate = media?.bitrate ? `${Math.round(media.bitrate)} kbps` : '';
        const isInQueue = state.queuePosition !== null && state.queueTotal !== null;
        const trackNum = isInQueue ? state.queuePosition : (state.currentTrack.index || '?');
        const totalTracks = isInQueue ? state.queueTotal : (state.albumTrackCount || '?');
        const trackStr = `${trackNum}/${totalTracks}`;

        // Symmetrical spacing: format, bitrate, label, track number
        const formatSize = 36;
        const bitrateSize = 26;
        const labelSize = 24;
        const maxTrackSize = 42;
        const minTrackSize = 16;
        const maxWidth = CANVAS.BUTTON_SIZE - 14; // 7px padding each side

        // Auto-shrink track number font to fit the button width
        let trackSize = maxTrackSize;
        ctx.font = `bold ${trackSize}px sans-serif`;
        while (ctx.measureText(trackStr).width > maxWidth && trackSize > minTrackSize) {
            trackSize--;
            ctx.font = `bold ${trackSize}px sans-serif`;
        }

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

        // Track number (e.g., 3/12 or 1234/10000)
        ctx.font = `bold ${trackSize}px sans-serif`;
        ctx.fillStyle = accentColor;
        ctx.fillText(trackStr, 72, gap + formatSize + gap + bitrateSize + gap + labelSize + gap + trackSize / 2);
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

    const isDimmed = state.playbackState === 'stopped';
    const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

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
        
        // Check display mode
        const displayMode = state.getTimeDisplayMode(context);
        
        if (displayMode === 'remaining') {
            // Show elapsed / -remaining
            const remaining = state.trackDuration - state.currentPosition;
            ctx.font = `bold ${timeSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.fillText(formatTime(state.currentPosition), 72, timeY);

            // Remaining time with minus sign
            ctx.font = `bold ${durationSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText('/ -' + formatTime(remaining), 72, durationY);
        } else {
            // Show elapsed / total (default)
            ctx.font = `bold ${timeSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.fillText(formatTime(state.currentPosition), 72, timeY);

            // Total duration
            ctx.font = `bold ${durationSize}px sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.fillText('/ ' + formatTime(state.trackDuration), 72, durationY);
        }

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
    
    const isDimmed = state.playbackState === 'stopped';
    const textColor = isDimmed ? COLORS.DARK_GRAY : getTextColor();
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

    if (state.currentTrack) {
        if (ratingMode === 'single') {
            // Single-star mode: "RATING" label at top, large centered star below
            // 3 states matching Plexamp: empty ☆ (unrated) → ★ (liked=10) → ★̶ (disliked=2)
            ctx.textAlign = 'center';
            ctx.font = 'bold 26px sans-serif';
            ctx.fillStyle = textColor;
            ctx.fillText('RATING', 72, 32);

            ctx.textBaseline = 'middle';
            ctx.font = 'bold 90px sans-serif';

            if (state.currentRating === RATING.SINGLE_LIKED) {
                // Liked: full ★ in accent color
                ctx.fillStyle = accentColor;
                ctx.fillText('★', 72, 90);
            } else if (state.currentRating === RATING.SINGLE_DISLIKED) {
                // Disliked: full ★ with diagonal "/" strikethrough in accent color
                ctx.fillStyle = accentColor;
                ctx.fillText('★', 72, 90);
                ctx.strokeStyle = accentColor;
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(38, 128);
                ctx.lineTo(108, 48);
                ctx.stroke();
            } else {
                // Unrated: empty ☆ in text color
                ctx.fillStyle = textColor;
                ctx.fillText('☆', 72, 90);
            }
        } else {
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
        } // end non-single block
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

    const isDimmed = state.playbackState === 'stopped';
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();
    const isOn = state.currentShuffle === 1;
    const settings = state.getActionSettings(context) || {};
    const accentOff = settings.shuffleAccentOff === true;
    const iconColor = isDimmed ? COLORS.DARK_GRAY : (isOn || accentOff ? accentColor : COLORS.DARK_GRAY);

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

    // State label - always shown, white text
    ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : COLORS.WHITE;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isOn ? 'ON' : 'OFF', 72, 130);
    
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

    const isDimmed = state.playbackState === 'stopped';
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();
    const isOn = state.currentRepeat > 0;
    const settings = state.getActionSettings(context) || {};
    const accentOff = settings.repeatAccentOff === true;
    const iconColor = isDimmed ? COLORS.DARK_GRAY : (isOn || accentOff ? accentColor : COLORS.DARK_GRAY);

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
        ctx.fillStyle = COLORS.WHITE;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1', 70, 78);
    }

    // State label - always shown, white text
    // Plex API: 1=One, 2=All
    const labelText = state.currentRepeat === 2 ? 'ALL' : state.currentRepeat === 1 ? 'ONE' : 'OFF';
    ctx.fillStyle = isDimmed ? COLORS.DARK_GRAY : COLORS.WHITE;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, 72, 128);
    
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
    const iconSize = parseInt(settings.navigationIconSize) || 60;
    const isDimmed = state.playbackState === 'stopped';
    const iconColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

    // Calculate animation offset (starts at center, moves left, wraps from right)
    let offsetX = 0;
    if (animationFrame !== null) {
        const speed = 30; // pixels per frame (adjusted for 500ms interval)
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
    const iconSize = parseInt(settings.navigationIconSize) || 60;
    const isDimmed = state.playbackState === 'stopped';
    const iconColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();

    // Calculate animation offset (starts at center, moves right, wraps from left)
    let offsetX = 0;
    if (animationFrame !== null) {
        const speed = 30; // pixels per frame (adjusted for 500ms interval)
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
 * Render volume up button
 */
export function renderVolumeUp(context) {
    renderVolumeButton(context, 'up');
}

/**
 * Render volume down button
 */
export function renderVolumeDown(context) {
    renderVolumeButton(context, 'down');
}

/**
 * Shared volume button renderer
 * Draws a speaker + waves icon with a +/- badge.
 * The icon is filled from bottom with accent color proportional to current volume.
 *
 * @param {string} context - Stream Deck button context
 * @param {'up'|'down'} direction - Which button variant to draw
 */
function renderVolumeButton(context, direction) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const S = CANVAS.BUTTON_SIZE; // 144

    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, S, S);

    const isDimmed = state.playbackState === 'stopped';
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();
    const volume = Math.max(0, Math.min(100, state.currentVolume ?? 50));

    // ── Speaker geometry ───────────────────────────────────────────
    // Box (rectangle on left): x 18-40, y 54-90
    // Cone (trapezoid flaring right): base at x=40 (y 54-90), tip at x=64 (y 34-110)
    const bL = 18, bR = 40, bT = 54, bB = 90;   // box
    const cR = 64, cT = 34, cB = 110;            // cone right-edge x, top y, bottom y

    // Two wave arcs to the right of the cone, centered on speaker midline
    const wCX = 58, wCY = 72;
    const waveData = [
        { r: 18, a0: -0.7, a1: 0.7 },
        { r: 34, a0: -0.7, a1: 0.7 }
    ];

    // +/- badge: top-right corner, centered at (112, 32)
    const bX = 112, bY = 32, bArm = 11;

    // Icon vertical bounds for fill calculation — must cover badge top (bY - bArm) too
    const iconTop = bY - bArm;  // 21 — top of the +/- badge arms
    const iconBottom = cB;      // 110

    // ── Draw helpers ───────────────────────────────────────────────
    const drawSpeaker = () => {
        ctx.beginPath();
        ctx.moveTo(bL, bT);           // box top-left
        ctx.lineTo(bR, bT);           // box top-right
        ctx.lineTo(cR, cT);           // cone upper tip
        ctx.lineTo(cR, cB);           // cone lower tip
        ctx.lineTo(bR, bB);           // box bottom-right
        ctx.lineTo(bL, bB);           // box bottom-left
        ctx.closePath();
    };

    const drawWaves = () => {
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (const w of waveData) {
            ctx.beginPath();
            ctx.arc(wCX, wCY, w.r, w.a0, w.a1);
            ctx.stroke();
        }
    };

    const drawBadge = () => {
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        // Horizontal bar (shared by + and -)
        ctx.beginPath();
        ctx.moveTo(bX - bArm, bY);
        ctx.lineTo(bX + bArm, bY);
        ctx.stroke();
        if (direction === 'up') {
            // Vertical bar to make +
            ctx.beginPath();
            ctx.moveTo(bX, bY - bArm);
            ctx.lineTo(bX, bY + bArm);
            ctx.stroke();
        }
    };

    // ── Step 1: full icon in dark gray (represents "empty") ────────
    ctx.fillStyle = COLORS.DARK_GRAY;
    drawSpeaker();
    ctx.fill();

    ctx.strokeStyle = COLORS.DARK_GRAY;
    drawWaves();
    drawBadge();

    // ── Step 2: clip to filled portion and redraw in accent color ──
    if (volume > 0) {
        const fillY = iconBottom - (volume / 100) * (iconBottom - iconTop);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, fillY, S, S - fillY);
        ctx.clip();

        ctx.fillStyle = accentColor;
        drawSpeaker();
        ctx.fill();

        ctx.strokeStyle = accentColor;
        drawWaves();
        drawBadge();

        ctx.restore();
    }

    sendImage(context, canvas.toDataURL('image/png'));
}

/**
 * Render playlist button.
 *
 * Empty (no playlist set): dot+bar list icon + "PLAYLIST" label.
 * Configured: large auto-sized name fills the button — no icon, easy to read.
 */
export function renderPlaylist(context) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const S = CANVAS.BUTTON_SIZE; // 144

    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, S, S);

    const isDimmed = state.playbackState === 'stopped';
    const accentColor = isDimmed ? COLORS.DARK_GRAY : getAccentColor();
    const settings = state.getActionSettings(context) || {};
    const playlistName = settings.playlistName || null;

    // ── Empty state: icon + "PLAYLIST" label ──────────────────────
    if (!playlistName) {
        // Symmetrical layout: icon block + label, 3 equal gaps
        const iconH   = 46;
        const labelSz = 18;
        const gap = (S - (iconH + labelSz)) / 3;

        const iconTop = gap;
        const labelY  = gap + iconH + gap + labelSz / 2;

        // 3-row Plexamp dot+bar list icon
        const rows = 3;
        const rowH = iconH / rows;
        const dotR = 4;
        const dotX = 28;
        const barX0 = dotX + dotR + 8;
        const barX1 = 116;

        ctx.fillStyle   = COLORS.MEDIUM_GRAY;
        ctx.strokeStyle = COLORS.MEDIUM_GRAY;
        ctx.lineWidth   = 4;
        ctx.lineCap     = 'round';

        for (let i = 0; i < rows; i++) {
            const rowY = iconTop + (i + 0.5) * rowH;
            ctx.beginPath();
            ctx.arc(dotX, rowY, dotR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(barX0, rowY);
            ctx.lineTo(barX1, rowY);
            ctx.stroke();
        }

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `bold ${labelSz}px sans-serif`;
        ctx.fillStyle    = COLORS.MEDIUM_GRAY;
        ctx.fillText('PLAYLIST', S / 2, labelY);

        sendImage(context, canvas.toDataURL('image/png'));
        return;
    }

    // ── Configured state: single line if it fits, else smart 2-line wrap ──
    const maxW    = S - 16;  // 8px padding each side
    const maxFont = 36;
    const minFont = 14;
    const mw = t => ctx.measureText(t).width;

    // Step 1: full name fits on one line at max font — simplest case
    ctx.font = `bold ${maxFont}px sans-serif`;
    if (mw(playlistName) <= maxW) {
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = accentColor;
        ctx.fillText(playlistName, S / 2, S / 2);
        sendImage(context, canvas.toDataURL('image/png'));
        return;
    }

    // Step 2: try 2-line word-wrap — find largest font where any clean split exists,
    //         then pick the most balanced (equal-width) split at that font size
    const words = playlistName.split(' ');
    let bestFont = 0, bestLines = null;

    if (words.length >= 2) {
        for (let fs = maxFont; fs >= minFont; fs--) {
            ctx.font = `bold ${fs}px sans-serif`;
            let bestSplit = null, bestDiff = Infinity;
            for (let split = 1; split < words.length; split++) {
                const l1 = words.slice(0, split).join(' ');
                const l2 = words.slice(split).join(' ');
                if (mw(l1) <= maxW && mw(l2) <= maxW) {
                    const diff = Math.abs(mw(l1) - mw(l2));
                    if (diff < bestDiff) { bestDiff = diff; bestSplit = split; }
                }
            }
            if (bestSplit !== null) {
                bestFont  = fs;
                bestLines = [
                    words.slice(0, bestSplit).join(' '),
                    words.slice(bestSplit).join(' ')
                ];
                break;
            }
        }
    }

    if (bestLines) {
        const lineH  = bestFont * 1.25;
        const blockH = 2 * lineH;
        const startY = (S - blockH) / 2 + lineH / 2;

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = accentColor;
        bestLines.forEach((line, i) => ctx.fillText(line, S / 2, startY + i * lineH));
        sendImage(context, canvas.toDataURL('image/png'));
        return;
    }

    // Step 3: last resort — single line shrunk + smart ellipsis (single long word, etc.)
    let fontSize = maxFont;
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (fontSize > minFont && mw(playlistName) > maxW) {
        fontSize--;
        ctx.font = `bold ${fontSize}px sans-serif`;
    }

    let displayText = playlistName;
    if (mw(displayText) > maxW) {
        // word-level: drop trailing words
        displayText = '';
        for (let i = words.length - 1; i >= 1; i--) {
            const candidate = words.slice(0, i).join(' ') + '\u2026';
            if (mw(candidate) <= maxW) { displayText = candidate; break; }
        }
        // char-level fallback
        if (!displayText) {
            displayText = playlistName;
            while (displayText.length > 1 && mw(displayText + '\u2026') > maxW) {
                displayText = displayText.slice(0, -1);
            }
            displayText = displayText.trimEnd() + '\u2026';
        }
    }

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = accentColor;
    ctx.fillText(displayText, S / 2, S / 2);

    sendImage(context, canvas.toDataURL('image/png'));
}

/**
 * Send image to Stream Deck
 */
function sendImage(context, dataUrl) {
    if (state.connection && state.connection.isConnected()) {
        state.connection.send({
            event: 'setImage',
            context: context,
            payload: { image: dataUrl, target: 0 }
        });
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
    renderRepeat,
    renderVolumeUp,
    renderVolumeDown,
    renderPlaylist
};
