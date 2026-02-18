/**
 * Helper Utilities
 * Common utility functions used throughout the plugin
 */

/**
 * Format milliseconds to M:SS or H:MM:SS
 */
export function formatTime(ms) {
    if (!ms || ms <= 0) return "0:00";
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Measure text width for canvas rendering
 */
export function measureTextWidth(text, font) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    return ctx.measureText(text).width;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Create a Web Worker from inline code
 */
export function createWorker(intervalMs) {
    const blob = new Blob([`
        var interval = null;
        self.onmessage = function(e) {
            if (e.data === "start" && !interval) {
                interval = setInterval(function() {
                    self.postMessage("tick");
                }, ${intervalMs});
            } else if (e.data === "stop" && interval) {
                clearInterval(interval);
                interval = null;
            }
        };
    `], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

/**
 * Safely terminate a worker
 */
export function terminateWorker(worker) {
    if (worker) {
        worker.postMessage("stop");
        worker.terminate();
    }
}

/**
 * Deep clone an object (simple version for settings)
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function call
 */
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Format rating (0-10) as star characters
 * @param {number} rating - Rating value from 0-10 (where 2 = 1 star, 10 = 5 stars)
 * @param {string} mode - 'half' for half-star increments, 'full' for full stars only
 * @returns {string} Star characters (★ = full, ⯨ = half, ☆ = empty)
 */
export function formatRating(rating, mode) {
    if (rating === 0) return "☆☆☆☆☆";
    
    const fullStars = Math.floor(rating / 2);
    const hasHalfStar = mode === "half" && (rating % 2 === 1);
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let result = "";
    for (let j = 0; j < fullStars; j++) result += "★";
    if (hasHalfStar) result += "⯨";
    for (let k = 0; k < emptyStars; k++) result += "☆";
    
    return result;
}
