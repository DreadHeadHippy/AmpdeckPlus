/**
 * Layout Manager
 * Handles touch strip layouts, scrolling text, and feedback
 */

import { SCROLL, COLORS } from '../core/constants.js';
import { formatTime, measureTextWidth } from '../utils/helpers.js';
import state from '../core/stateManager.js';
import logger from '../utils/logger.js';

/**
 * Get text color
 */
function getTextColor() {
    return state.getGlobalSetting('textColor') || COLORS.WHITE;
}

/**
 * Get accent color
 */
function getAccentColor() {
    const dynamicColors = state.getGlobalSetting('dynamicColors');
    return (dynamicColors === undefined || dynamicColors) 
        ? state.dominantColor 
        : COLORS.DEFAULT;
}

/**
 * Get secondary color based on text color
 */
function getSecondaryColor(textColor) {
    const colorMap = {
        [COLORS.WHITE]: '#999999',
        '#BBBBBB': '#777777',
        [COLORS.DEFAULT]: '#B07A0A',
        '#FFBF00': '#B08600',
        [COLORS.BLACK]: '#444444'
    };
    return colorMap[textColor] || '#999999';
}

/**
 * Render touch strip layout
 */
export function renderStripLayout(context) {
    const settings = state.getActionSettings(context);
    const displayMode = settings.displayMode || 'artist';
    const fontSize = parseInt(settings.fontSize) || 16;
    const totalPanels = parseInt(settings.progressTotalPanels) || 3;
    const position = parseInt(settings.progressPosition) || 1;

    const textColor = settings.textColor || getTextColor();
    const accentColor = getAccentColor();
    const stripSecondary = getSecondaryColor(textColor);

    let label = '', text = '';
    if (state.currentTrack) {
        if (displayMode === 'artist') {
            label = 'ARTIST';
            text = state.currentTrack.grandparentTitle || 'Unknown';
        } else if (displayMode === 'album') {
            label = 'ALBUM';
            text = state.currentTrack.parentTitle || 'Unknown';
        } else if (displayMode === 'track') {
            label = 'TRACK';
            text = state.currentTrack.title || 'Unknown';
        } else if (displayMode === 'time') {
            label = 'TIME';
            text = `${formatTime(state.currentPosition)} / ${formatTime(state.trackDuration)}`;
        }
    } else {
        label = displayMode.toUpperCase();
        text = displayMode === 'time' ? '0:00 / 0:00' : 'Not Playing';
    }

    const labelSize = Math.max(14, Math.round(fontSize * 0.85));
    const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, accentColor);

    const pausedDim = state.playbackState === 'paused';
    const labelColor = pausedDim ? stripSecondary : textColor;
    const textDisplayColor = pausedDim ? stripSecondary : textColor;

    // Always use pixmap for displayText for consistent rendering
    const textAreaH = fontSize + 8;
    
    // Calculate symmetrical spacing
    const stripHeight = 100;
    const progressBarHeight = 4;
    const labelHeight = labelSize + 4;
    const contentHeight = labelHeight + textAreaH + progressBarHeight;
    const totalGap = stripHeight - contentHeight;
    const gap = totalGap / 4; // Equal spacing: top, between label & text, between text & progress, bottom
    
    const labelY = gap;
    const textY = gap + labelHeight + gap;
    const progressY = textY + textAreaH + gap;
    
    const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}`;
    
    if (state.lastLayoutState[context] !== layoutKey) {
        state.lastLayoutState[context] = layoutKey;
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.layout',
            items: [
                {
                    key: 'label',
                    type: 'text',
                    rect: [0, labelY, 200, labelHeight],
                    font: { size: labelSize, weight: 700 },
                    color: labelColor,
                    alignment: 'center'
                },
                {
                    key: 'displayText',
                    type: 'pixmap',
                    rect: [0, textY, 200, textAreaH]
                },
                {
                    key: 'progressBar',
                    type: 'pixmap',
                    rect: [0, progressY, 200, progressBarHeight]
                }
            ]
        });
    }

    // Check if text needs scrolling
    const font = `${fontSize}px sans-serif`;
    const needsScroll = measureTextWidth(text, font) > 190;

    let textImage;
    if (needsScroll) {
        textImage = renderScrollingText(context, text, fontSize, textDisplayColor);
    } else {
        if (state.stripScrollState[context]) {
            delete state.stripScrollState[context];
        }
        textImage = renderStaticText(text, fontSize, textDisplayColor);
    }

    setFeedback(context, {
        label: label,
        displayText: textImage,
        progressBar: progressBar
    });
}

/**
 * Render static text (no scrolling needed)
 */
function renderStaticText(text, fontSize, color) {
    const canvasW = 200;
    const canvasH = fontSize + 8;
    const font = `${fontSize}px sans-serif`;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, canvasW / 2, 2);

    return canvas.toDataURL('image/png');
}

/**
 * Render scrolling text
 */
function renderScrollingText(context, text, fontSize, color) {
    const canvasW = 200;
    const canvasH = fontSize + 8;
    const font = `${fontSize}px sans-serif`;

    // Get or initialize scroll state
    if (!state.stripScrollState[context]) {
        state.stripScrollState[context] = {
            offset: 0,
            isPaused: true,
            pauseStart: Date.now(),
            lastUpdate: Date.now()
        };
    }

    const scrollState = state.stripScrollState[context];
    const now = Date.now();
    const elapsed = now - scrollState.lastUpdate;
    scrollState.lastUpdate = now;

    const textWidth = measureTextWidth(text, font);
    const maxScroll = textWidth + SCROLL.GAP;

    // Handle scrolling logic
    if (scrollState.isPaused) {
        if (now - scrollState.pauseStart >= SCROLL.PAUSE) {
            scrollState.isPaused = false;
        }
    } else {
        const scrollAmount = (SCROLL.SPEED * elapsed) / 1000;
        scrollState.offset += scrollAmount;

        if (scrollState.offset >= maxScroll) {
            scrollState.offset = 0;
            scrollState.isPaused = true;
            scrollState.pauseStart = now;
        }
    }

    // Render text
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';

    // Draw text twice for seamless loop
    const x1 = -scrollState.offset;
    const x2 = x1 + textWidth + SCROLL.GAP;
    
    ctx.fillText(text, x1, 2);
    ctx.fillText(text, x2, 2);

    return canvas.toDataURL('image/png');
}

/**
 * Create progress bar segment for multi-panel strips
 */
function createProgressBarSegment(position, totalPanels, progress, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.DARK_GRAY;
    ctx.fillRect(0, 0, 200, 4);

    if (position > 0 && position <= totalPanels) {
        const segSize = 100 / totalPanels;
        const segStart = (position - 1) * segSize;
        const segEnd = position * segSize;
        
        if (progress > segStart) {
            const progressInSeg = Math.min(progress, segEnd) - segStart;
            const fillWidth = Math.round((progressInSeg / segSize) * 200);
            if (fillWidth > 0) {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, fillWidth, 4);
            }
        }
    }
    
    return canvas.toDataURL('image/png');
}

/**
 * Display temporary overlay on strip
 */
/**
 * Show overlay on strip with title and optional subtitle
 * @param {string} context - Action context
 * @param {string} title - Main title text
 * @param {string} subtitle - Optional subtitle (value display)
 */
export function showStripOverlay(context, title, subtitle = null) {
    // Clear any existing timer to prevent premature dismissal
    const existingOverlay = state.getStripOverlay(context);
    if (existingOverlay?.timer) {
        clearTimeout(existingOverlay.timer);
    }

    // Render overlay
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, 200, 100);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.WHITE;

    if (subtitle) {
        // Two-line display with symmetrical spacing - larger text for better visibility
        const titleSize = 24;
        const subtitleSize = 44;
        const totalContent = titleSize + subtitleSize;
        const gap = (100 - totalContent) / 3; // Equal spacing: top, middle, bottom
        
        const titleY = gap + titleSize / 2;
        const subtitleY = gap + titleSize + gap + subtitleSize / 2;
        
        ctx.font = `bold ${titleSize}px sans-serif`;
        ctx.fillText(title, 100, titleY);
        ctx.font = `bold ${subtitleSize}px sans-serif`;
        ctx.fillText(subtitle, 100, subtitleY);
    } else {
        // Single line display - vertically centered with larger text
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(title, 100, 50);
    }

    const overlayImage = canvas.toDataURL('image/png');

    // Send full overlay layout
    setFeedbackLayout(context, {
        id: 'com.dreadheadhippy.ampdeckplus.overlay',
        items: [
            {
                key: 'overlay',
                type: 'pixmap',
                rect: [0, 0, 200, 100]
            }
        ]
    });

    setFeedback(context, { overlay: overlayImage });

    // Set new timer - resets the countdown on each dial rotation
    const timer = setTimeout(() => {
        state.clearStripOverlay(context);
        state.lastLayoutState[context] = null;
        renderStripLayout(context);
    }, 1500);

    // Store overlay with timer reference
    state.setStripOverlay(context, {
        title: title,
        subtitle: subtitle,
        timer: timer
    });

    logger.debug(`Overlay shown: ${title}${subtitle ? ' - ' + subtitle : ''}`);
}

/**
 * Send feedback layout to Stream Deck
 */
function setFeedbackLayout(context, layout) {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
            event: 'setFeedbackLayout',
            context: context,
            payload: { layout: layout }
        }));
    }
}

/**
 * Send feedback to Stream Deck
 */
function setFeedback(context, payload) {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
            event: 'setFeedback',
            context: context,
            payload: payload
        }));
    }
}

export default {
    renderStripLayout,
    showStripOverlay
};
