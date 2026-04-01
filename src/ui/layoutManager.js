/**
 * Layout Manager
 * Handles touch strip layouts, scrolling text, and feedback
 */

import { SCROLL, COLORS } from '../core/constants.js';
import { formatTime, measureTextWidth, formatRating } from '../utils/helpers.js';
import state from '../core/stateManager.js';
import plexConnection from '../plex/plexConnection.js';
import logger from '../utils/logger.js';

// Cache of poster art dataUrls keyed by playlist ratingKey
const posterCache = new Map();

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
    // Never overwrite an active overlay regardless of caller
    if (state.getStripOverlay(context)) return;

    const settings = state.getActionSettings(context);
    const displayMode = state.getActiveDisplayMode(context) || settings.displayMode || 'artist';
    const fontSize = parseInt(settings.fontSize) || 16;
    const totalPanels = parseInt(settings.progressTotalPanels) || 3;
    const position = parseInt(settings.progressPosition) || 1;

    const textColor = getTextColor();
    const accentColor = getAccentColor();
    const stripSecondary = getSecondaryColor(textColor);
    const isDimmed = state.playbackState === 'stopped';
    const effectiveAccent  = isDimmed ? stripSecondary : accentColor;

    let label = '', text = '';
    if (displayMode === 'playlists') {
        return renderPlaylistCarousel(context, settings, fontSize, totalPanels, position, textColor, accentColor, stripSecondary);
    } else if (displayMode === 'queue') {
        return renderQueueBrowser(context, settings, accentColor, textColor, stripSecondary);
    } else if (state.currentTrack) {
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
    const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, effectiveAccent);

    const showLabel = settings.showStripLabel !== false; // default true
    const labelColor = isDimmed ? stripSecondary : textColor;
    const textDisplayColor = isDimmed ? stripSecondary : textColor;

    // Always use pixmap for displayText for consistent rendering
    const textAreaH = fontSize + 8;
    const labelHeight = labelSize + 4;
    const progressBarHeight = 10;

    // Pin progress bar a few pixels from the bottom
    const progressY = 90;
    let labelY, textY;
    if (showLabel) {
        // 3 equal gaps: above label, between label & text, between text & bar
        const gap = (progressY - labelHeight - textAreaH) / 3;
        labelY = gap;
        textY = gap + labelHeight + gap;
    } else {
        textY = (progressY - textAreaH) / 2;
    }

    const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}|${showLabel}`;

    if (state.lastLayoutState[context] !== layoutKey) {
        state.lastLayoutState[context] = layoutKey;
        const items = [];
        if (showLabel) {
            items.push({
                key: 'label',
                type: 'text',
                rect: [0, labelY, 200, labelHeight],
                font: { size: labelSize, weight: 700 },
                color: labelColor,
                alignment: 'center'
            });
        }
        items.push(
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
        );
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.layout',
            items: items
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

    const feedback = { displayText: textImage, progressBar: progressBar };
    if (showLabel) feedback.label = label;
    setFeedback(context, feedback);
}

/**
 * Render the "Up Next" queue browser: scrollable text list with focused row highlighted.
 * Dial rotation moves the cursor; dial press removes the focused track from the queue.
 */
function renderQueueBrowser(context, settings, accentColor, textColor, stripSecondary) {
    const layoutKey = 'queue-browser';
    if (state.lastLayoutState[context] !== layoutKey) {
        state.lastLayoutState[context] = layoutKey;
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.overlay',
            items: [{ key: 'overlay', type: 'pixmap', rect: [0, 0, 200, 100] }]
        });
    }

    const qbs           = state.getQueueBrowserState(context);
    const isDimmed      = state.playbackState === 'stopped';
    const effectiveAccent = isDimmed ? stripSecondary : accentColor;

    const HEADER_H = 11;
    const ROW_H    = 26;
    const ROWS     = 3;
    const BAR_H    = 10;
    // Layout: 11 + 26×3 + 5 = 94px

    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 200, 100);

    // Header bar
    ctx.fillStyle = isDimmed ? 'rgba(0,0,0,0.75)' : hexToRgba(effectiveAccent, 0.55);
    ctx.fillRect(0, 0, 200, HEADER_H);
    ctx.font = 'bold 9px sans-serif';
    ctx.textBaseline = 'middle';
    const headerMid = HEADER_H / 2;
    ctx.fillStyle = isDimmed ? stripSecondary : textColor;
    ctx.textAlign = 'left';
    ctx.fillText('UP NEXT', 4, headerMid);

    const total       = qbs?.items?.length || 0;
    const cursorIndex = qbs?.cursorIndex   || 0;
    if (total > 0) {
        ctx.fillStyle = isDimmed ? stripSecondary : textColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${cursorIndex + 1} / ${total}`, 197, headerMid);
    }

    // Row area
    if (!qbs || total === 0) {
        ctx.fillStyle = stripSecondary;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(qbs ? 'Queue is empty' : 'Loading\u2026', 100, HEADER_H + (ROW_H * ROWS) / 2);
    } else {
        const windowStart = Math.max(0, Math.min(cursorIndex - 1, total - ROWS));
        const focusedRow  = cursorIndex - windowStart;

        for (let row = 0; row < ROWS; row++) {
            const itemIdx = windowStart + row;
            if (itemIdx >= total) break;
            const item      = qbs.items[itemIdx];
            const isFocused = (row === focusedRow);
            const isLocked  = (itemIdx === 0);
            const rowY      = HEADER_H + row * ROW_H;

            if (isFocused) {
                // Locked (next track): neutral grey — signals "not interactive" while accent
                // left bar + accent lock icon still communicate focus and locked state.
                ctx.fillStyle = isLocked
                    ? (isDimmed ? 'rgba(60,60,60,0.22)' : 'rgba(150,150,150,0.15)')
                    : (isDimmed ? 'rgba(80,80,80,0.25)'  : hexToRgba(effectiveAccent, 0.25));
                ctx.fillRect(0, rowY, 200, ROW_H);
                ctx.fillStyle = effectiveAccent;
                ctx.fillRect(0, rowY, 3, ROW_H);
            }

            // Clip row so long titles don't overflow into adjacent rows
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, rowY, 200, ROW_H);
            ctx.clip();

            const dimAlpha  = isFocused ? 1.0 : 0.65;
            const titleSize = isFocused ? 11 : 10;
            const titleFont = `${isFocused ? 'bold ' : ''}${titleSize}px sans-serif`;

            // Draw a padlock icon in the icon column (accent bar 0–3, title at 21)
            if (itemIdx === 0) {
                // When focused: accent color lock pops against the grey row — clearly locked/special.
                // When not focused: recede to 50% white so it doesn't compete with title text.
                const iconColor = isFocused
                    ? (isDimmed ? stripSecondary : effectiveAccent)
                    : (isDimmed
                        ? `rgba(120,120,120,0.50)`
                        : `rgba(255,255,255,0.50)`);

                const cx       = 12;           // horizontal center of icon column
                const iconTop  = rowY + 3;     // 3px top padding in 28px row
                const sR       = 5;            // shackle arc radius
                const sArcY    = iconTop + 6;  // arc center y  (arc top = iconTop+1)
                const bodyX    = 4;            // body left edge
                const bodyW    = 16;           // body width  (right edge = 20)
                const bodyTop  = sArcY + 2;    // body top (shackle legs enter here)
                const bodyH    = 14;           // body height → bottom at iconTop+22

                // Filled body
                ctx.fillStyle = iconColor;
                ctx.beginPath();
                ctx.roundRect(bodyX, bodyTop, bodyW, bodyH, 2);
                ctx.fill();

                // Shackle — stroked U-shape above body
                ctx.strokeStyle = iconColor;
                ctx.lineWidth   = 1.8;
                ctx.lineCap     = 'round';
                ctx.beginPath();
                ctx.moveTo(cx - sR, bodyTop + 3);  // left leg (inside body)
                ctx.lineTo(cx - sR, sArcY);         // up to arc
                ctx.arc(cx, sArcY, sR, Math.PI, 0); // arch over top
                ctx.lineTo(cx + sR, bodyTop + 3);   // right leg (inside body)
                ctx.stroke();

                // Keyhole cutout
                ctx.fillStyle = isDimmed ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.65)';
                const ky = bodyTop + 5;
                ctx.beginPath();
                ctx.arc(cx, ky, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(cx - 1.5, ky, 3, 3.5); // slot below circle
            }

            const titleX     = itemIdx === 0 ? 21 : 5;
            const titleWidth = itemIdx === 0 ? 172 : 188;
            const rawTitle   = item.title || 'Unknown';
            const titleText  = truncateText(ctx, rawTitle, titleFont, titleWidth);
            ctx.font      = titleFont;
            ctx.fillStyle = isDimmed
                ? `rgba(150,150,150,${dimAlpha})`
                : `rgba(255,255,255,${dimAlpha})`;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(titleText, titleX, rowY + 3);

            if (item.artist) {
                const artistFont = '9px sans-serif';
                // Use the dedicated queue star rating setting; 'none' suppresses display
                const queueRatingMode = settings.queueRatingMode || 'half';
                const stars = (item.userRating && queueRatingMode !== 'none')
                    ? formatRating(item.userRating, queueRatingMode) : null;
                const artistText = truncateText(ctx, item.artist, artistFont, itemIdx === 0 ? 167 : 188);
                ctx.font      = artistFont;
                ctx.fillStyle = isDimmed
                    ? `rgba(100,100,100,${dimAlpha})`
                    : `rgba(180,180,180,${dimAlpha})`;
                ctx.textAlign = 'left';
                ctx.fillText(artistText, titleX, rowY + 3 + titleSize + 2);
                if (stars) {
                    ctx.fillStyle = isDimmed
                        ? `rgba(120,120,120,${dimAlpha})`
                        : hexToRgba(effectiveAccent, dimAlpha);
                    ctx.textAlign = 'right';
                    ctx.fillText(stars, 196, rowY + 3 + titleSize + 2);
                    ctx.textAlign = 'left';
                }
            }

            ctx.restore();
        }
    }

    // Progress bar
    const totalPanels = parseInt(settings.progressTotalPanels) || 3;
    const position    = parseInt(settings.progressPosition)    || 1;
    const progress    = state.displayProgress;
    const barY        = 90; // match other strip modes
    ctx.fillStyle = COLORS.DARK_GRAY;
    ctx.fillRect(0, barY, 200, BAR_H);
    if (position > 0 && position <= totalPanels) {
        const segSize  = 100 / totalPanels;
        const segStart = (position - 1) * segSize;
        const segEnd   = position * segSize;
        if (progress > segStart) {
            const progressInSeg = Math.min(progress, segEnd) - segStart;
            const fillWidth = Math.round((progressInSeg / segSize) * 200);
            if (fillWidth > 0) {
                ctx.fillStyle = effectiveAccent;
                ctx.fillRect(0, barY, fillWidth, BAR_H);
            }
        }
    }

    if (isDimmed) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, 200, 100);
    }

    setFeedback(context, { overlay: canvas.toDataURL('image/png') });
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function truncateText(ctx, text, font, maxWidth) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
    return t + '\u2026';
}

/**
 * Render 3-up poster carousel: prev (dim) | current (highlighted) | next (dim)
 */
function renderPlaylistCarouselPoster(context, carousel, accentColor) {
    const layoutKey = 'carousel-3up';
    if (state.lastLayoutState[context] !== layoutKey) {
        state.lastLayoutState[context] = layoutKey;
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.overlay',
            items: [{ key: 'overlay', type: 'pixmap', rect: [0, 0, 200, 100] }]
        });
    }

    if (!carousel || carousel.playlists.length === 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 100);
        ctx.fillStyle = COLORS.WHITE;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(carousel ? 'No Playlists' : 'Loading...', 100, 50);
        setFeedback(context, { overlay: canvas.toDataURL('image/png') });
        return;
    }

    const playlists = carousel.playlists;
    const n = playlists.length;
    const idx = carousel.index;
    const prevIdx = (idx - 1 + n) % n;
    const nextIdx = (idx + 1) % n;
    const currentPlaylist = playlists[idx];
    const prevPlaylist = n > 1 ? playlists[prevIdx] : null;
    const nextPlaylist = n > 1 ? playlists[nextIdx] : null;

    // Pin progress bar at the same bottom position as Queue and text modes (y=90, h=5).
    const NAME_H = 12;
    const PROG_Y = 90;
    const PROG_H = 10;
    const ART_Y = NAME_H;
    const ART_H = PROG_Y - NAME_H; // art zone between name bar and progress bar
    // Scale poster sizes proportionally to fit art zone (reference: CH=74, SH=50 at ART_H=84)
    const _sc = ART_H / 84;
    const CH = Math.max(Math.floor(74 * _sc), 28), CW = CH;
    const SH = Math.max(Math.floor(50 * _sc), 18), SW = SH;
    // Horizontal: 2 | SW | hGap | CW | hGap | SW | 2 = 200
    const hGap = Math.floor((196 - SW - CW - SW) / 2);
    const SX_L = 2, SX_R = 200 - 2 - SW;
    const CX = SX_L + SW + hGap;
    const SY = ART_Y + Math.round((ART_H - SH) / 2);
    const CY = ART_Y + Math.round((ART_H - CH) / 2);

    // Draw a poster image cover-fit into a clipped rect, or a placeholder
    const drawPoster = (ctx, imgEl, x, y, w, h) => {
        if (imgEl) {
            const iw = imgEl.naturalWidth || w, ih = imgEl.naturalHeight || h;
            const scale = Math.max(w / iw, h / ih);
            const sw = iw * scale, sh = ih * scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.drawImage(imgEl, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
            ctx.restore();
        } else {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(x, y, w, h);
            ctx.save();
            ctx.fillStyle = '#666666';
            ctx.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u266a', x + w / 2, y + h / 2);
            ctx.restore();
        }
    };

    // Resolve an image from cache, trigger async fetch if missing, call back immediately
    const resolveImage = (playlist, callback) => {
        if (!playlist) { callback(null); return; }
        const key = playlist.ratingKey;
        if (posterCache.has(key)) {
            const url = posterCache.get(key);
            if (url) {
                const img = new Image();
                img.onload = () => callback(img);
                img.src = url;
            } else {
                callback(null);
            }
        } else {
            callback(null); // Placeholder immediately
            if (playlist.compositePath) {
                plexConnection.fetchAlbumArt(playlist.compositePath)
                    .then(dataUrl => {
                        posterCache.set(key, dataUrl);
                        state.getAllContexts().forEach(ctx => {
                            if (state.getCarouselState(ctx)) {
                                state.lastLayoutState[ctx] = null;
                                renderStripLayout(ctx);
                            }
                        });
                    })
                    .catch(() => posterCache.set(key, null));
            } else {
                posterCache.set(key, null);
            }
        }
    };

    // Collect all 3 images then composite and send
    let prevImg, currImg, nextImg;
    let resolved = 0;
    const tryDraw = () => {
        if (++resolved < 3) return;

        // An overlay (e.g. "PLAYING") may have been set while async image loads were in flight
        if (state.getStripOverlay(context)) return;
        const isDimmed = state.playbackState === 'stopped';
        const effectiveAccent = isDimmed ? COLORS.MEDIUM_GRAY : accentColor;

        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 100);

        // Side posters (draw then dim)
        if (n > 1) {
            drawPoster(ctx, prevImg, SX_L, SY, SW, SH);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(SX_L, SY, SW, SH);

            drawPoster(ctx, nextImg, SX_R, SY, SW, SH);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(SX_R, SY, SW, SH);
        }

        // Name bar at top — counter and title at same size, counter right-aligned
        const name = currentPlaylist.title;
        const counterText = `${idx + 1}\u2009/\u2009${n}`;
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, 200, NAME_H);
        // Find the largest font size where both title and counter fit
        let ns = 11;
        ctx.font = `bold ${ns}px sans-serif`;
        const counterW = ctx.measureText(counterText).width + 6; // 3px padding each side
        while (ns > 7 && ctx.measureText(name).width > (196 - counterW)) { ns--; ctx.font = `bold ${ns}px sans-serif`; }
        // Draw title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDimmed ? COLORS.MEDIUM_GRAY : COLORS.WHITE;
        ctx.fillText(name, 100, NAME_H / 2);
        // Draw counter (same font size, right side)
        ctx.fillStyle = effectiveAccent;
        ctx.textAlign = 'right';
        ctx.fillText(counterText, 198, NAME_H / 2);

        // Center poster with 1px accent border
        ctx.fillStyle = effectiveAccent;
        ctx.fillRect(CX - 1, CY - 1, CW + 2, CH + 2);
        drawPoster(ctx, currImg, CX, CY, CW, CH);

        // Progress bar at bottom
        const pgSettings = state.getActionSettings(context);
        const totalPanels = parseInt(pgSettings.progressTotalPanels) || 1;
        const position = parseInt(pgSettings.progressPosition) || 0;
        const progress = state.displayProgress;
        ctx.fillStyle = COLORS.DARK_GRAY;
        ctx.fillRect(0, PROG_Y, 200, PROG_H);
        if (position > 0 && position <= totalPanels) {
            const segSize = 100 / totalPanels;
            const segStart = (position - 1) * segSize;
            const segEnd = position * segSize;
            if (progress > segStart) {
                const progressInSeg = Math.min(progress, segEnd) - segStart;
                const fillWidth = Math.round((progressInSeg / segSize) * 200);
                if (fillWidth > 0) {
                    ctx.fillStyle = effectiveAccent;
                    ctx.fillRect(0, PROG_Y, fillWidth, PROG_H);
                }
            }
        }

        // Poster dim overlay — same weight as text carousel grey
        if (isDimmed) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, 200, 100);
        }

        setFeedback(context, { overlay: canvas.toDataURL('image/png') });
    };

    resolveImage(prevPlaylist, img => { prevImg = img; tryDraw(); });
    resolveImage(currentPlaylist, img => { currImg = img; tryDraw(); });
    resolveImage(nextPlaylist, img => { nextImg = img; tryDraw(); });
}

/**
 * Render playlist carousel mode for the strip
 */
function renderPlaylistCarousel(context, settings, fontSize, totalPanels, position, textColor, accentColor, stripSecondary) {
    const style = settings.carouselStyle || 'text';
    if (style === 'poster') {
        return renderPlaylistCarouselPoster(context, state.getCarouselState(context), accentColor);
    }

    const carousel = state.getCarouselState(context);
    const isDimmed = state.playbackState === 'stopped';
    const labelColor = isDimmed ? stripSecondary : textColor;
    const textDisplayColor = isDimmed ? stripSecondary : textColor;

    let label, text;
    if (!carousel || carousel.playlists.length === 0) {
        label = 'PLAYLISTS';
        text = carousel ? 'No Playlists' : 'Loading...';
    } else {
        const total = carousel.playlists.length;
        const idx = carousel.index;
        label = `PLAYLIST ${idx + 1} / ${total}`;
        text = carousel.playlists[idx].title;
    }

    const showLabel = settings.showStripLabel !== false; // default true
    const labelSize = Math.max(14, Math.round(fontSize * 0.85));
    const progressBar = createProgressBarSegment(position, totalPanels, state.displayProgress, accentColor);
    const textAreaH = fontSize + 8;
    const labelHeight = labelSize + 4;
    const progressBarHeight = 10;

    // Pin progress bar a few pixels from the bottom
    const progressY = 90;
    let labelY, textY;
    if (showLabel) {
        // 3 equal gaps: above label, between label & text, between text & bar
        const gap = (progressY - labelHeight - textAreaH) / 3;
        labelY = gap;
        textY = gap + labelHeight + gap;
    } else {
        textY = (progressY - textAreaH) / 2;
    }

    const layoutKey = `px|${labelColor}|${labelSize}|${textAreaH}|${showLabel}`;

    if (state.lastLayoutState[context] !== layoutKey) {
        state.lastLayoutState[context] = layoutKey;
        const items = [];
        if (showLabel) {
            items.push({
                key: 'label',
                type: 'text',
                rect: [0, labelY, 200, labelHeight],
                font: { size: labelSize, weight: 700 },
                color: labelColor,
                alignment: 'center'
            });
        }
        items.push(
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
        );
        setFeedbackLayout(context, {
            id: 'com.dreadheadhippy.ampdeckplus.layout',
            items: items
        });
    }

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

    const feedback = { displayText: textImage, progressBar: progressBar };
    if (showLabel) feedback.label = label;
    setFeedback(context, feedback);
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
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = COLORS.DARK_GRAY;
    ctx.fillRect(0, 0, 200, 10);

    if (position > 0 && position <= totalPanels) {
        const segSize = 100 / totalPanels;
        const segStart = (position - 1) * segSize;
        const segEnd = position * segSize;
        
        if (progress > segStart) {
            const progressInSeg = Math.min(progress, segEnd) - segStart;
            const fillWidth = Math.round((progressInSeg / segSize) * 200);
            if (fillWidth > 0) {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, fillWidth, 10);
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
        // Two-line display — auto-size subtitle to fit within canvas width
        const titleSize = 24;
        let subtitleSize = 44;
        ctx.font = `bold ${subtitleSize}px sans-serif`;
        while (subtitleSize > 12 && ctx.measureText(subtitle).width > 190) {
            subtitleSize -= 2;
            ctx.font = `bold ${subtitleSize}px sans-serif`;
        }
        const totalContent = titleSize + subtitleSize;
        const gap = (100 - totalContent) / 3;

        const titleY = gap + titleSize / 2;
        const subtitleY = gap + titleSize + gap + subtitleSize / 2;

        ctx.font = `bold ${titleSize}px sans-serif`;
        ctx.fillText(title, 100, titleY);
        ctx.font = `bold ${subtitleSize}px sans-serif`;
        ctx.fillText(subtitle, 100, subtitleY);
    } else {
        // Single line display — auto-size to fit within canvas width
        let singleSize = 36;
        ctx.font = `bold ${singleSize}px sans-serif`;
        while (singleSize > 12 && ctx.measureText(title).width > 190) {
            singleSize -= 2;
            ctx.font = `bold ${singleSize}px sans-serif`;
        }
        ctx.fillText(title, 100, 50);
    }

    const overlayImage = canvas.toDataURL('image/png');

    // Store overlay state FIRST so any concurrent renderStripLayout call sees it immediately
    const timer = setTimeout(() => {
        state.clearStripOverlay(context);
        state.lastLayoutState[context] = null;
        renderStripLayout(context);
    }, 1500);

    state.setStripOverlay(context, {
        title: title,
        subtitle: subtitle,
        timer: timer
    });

    // Send layout and feedback after state is locked in
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

    logger.debug(`Overlay shown: ${title}${subtitle ? ' - ' + subtitle : ''}`);
}

/**
 * Send feedback layout to Stream Deck
 */
function setFeedbackLayout(context, layout) {
    if (state.connection && state.connection.isConnected()) {
        state.connection.send({
            event: 'setFeedbackLayout',
            context: context,
            payload: { layout: layout }
        });
    }
}

/**
 * Send feedback to Stream Deck
 */
function setFeedback(context, payload) {
    if (state.connection && state.connection.isConnected()) {
        state.connection.send({
            event: 'setFeedback',
            context: context,
            payload: payload
        });
    }
}

/**
 * Clear poster image cache (call when playlists are reloaded)
 */
export function clearCarouselPosterCache() {
    posterCache.clear();
}

export default {
    renderStripLayout,
    showStripOverlay,
    clearCarouselPosterCache
};
