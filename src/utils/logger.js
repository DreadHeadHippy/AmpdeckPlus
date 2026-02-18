/**
 * Logging System
 * Centralized logging with level filtering and buffer management
 */

import { LOG_LEVELS, MAX_LOG_ENTRIES } from '../core/constants.js';

class Logger {
    constructor() {
        this.logs = [];
        this.currentLevel = LOG_LEVELS.INFO;
    }

    setLevel(level) {
        this.currentLevel = level;
    }

    debug(msg, data) {
        this.logAt(LOG_LEVELS.DEBUG, msg, data);
    }

    info(msg, data) {
        this.logAt(LOG_LEVELS.INFO, msg, data);
    }

    warn(msg, data) {
        this.logAt(LOG_LEVELS.WARN, msg, data);
    }

    error(msg, data) {
        this.logAt(LOG_LEVELS.ERROR, msg, data);
    }

    logAt(level, msg, data) {
        if (level < this.currentLevel) return;

        const levelName = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level);
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        const sanitized = this.sanitizeMessage(msg);
        
        let logEntry = `[${timestamp}] [${levelName}] ${sanitized}`;
        if (data !== undefined) {
            logEntry += ' ' + JSON.stringify(data, null, 2);
        }

        this.logs.push(logEntry);
        if (this.logs.length > MAX_LOG_ENTRIES) {
            this.logs.shift();
        }

        console.log(`[${levelName}]`, sanitized, data);
    }

    sanitizeMessage(msg) {
        if (typeof msg !== 'string') return String(msg);
        return msg.replace(/X-Plex-Token=[^&\s]*/gi, 'X-Plex-Token=***');
    }

    dump() {
        console.log("=== AMPDECK+ DEBUG LOGS ===");
        console.log(this.logs.join('\n'));
        return this.logs.join('\n');
    }

    clear() {
        this.logs = [];
        console.log("Debug logs cleared");
    }
}

// Singleton instance
const logger = new Logger();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.dumpLogs = () => {
        alert(`Logs copied to console! See console tab (F12).\n\nTotal entries: ${logger.logs.length}`);
        return logger.dump();
    };
    window.clearLogs = () => logger.clear();
}

export default logger;
