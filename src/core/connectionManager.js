/**
 * Connection Manager
 * Handles WebSocket connection to Stream Deck with automatic reconnection
 */

import { TIMING } from './constants.js';
import logger from '../utils/logger.js';

class ConnectionManager {
    constructor(messageHandler) {
        this.messageHandler = messageHandler;
        this.websocket = null;
        this.pluginUUID = null;
        this.port = null;
        this.registerEvent = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.isIntentionalClose = false;
    }

    /**
     * Connect to Stream Deck
     */
    connect(port, pluginUUID, registerEvent) {
        this.port = port;
        this.pluginUUID = pluginUUID;
        this.registerEvent = registerEvent;
        this.isIntentionalClose = false;

        try {
            this.websocket = new WebSocket(`ws://127.0.0.1:${port}`);
            this.setupHandlers();
            logger.info(`Connecting to Stream Deck on port ${port}...`);
        } catch (error) {
            logger.error('Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    setupHandlers() {
        this.websocket.onopen = () => {
            this.reconnectAttempts = 0;
            this.send({
                event: this.registerEvent,
                uuid: this.pluginUUID
            });
            this.send({
                event: 'getGlobalSettings',
                context: this.pluginUUID
            });
            logger.info('✓ Connected to Stream Deck');
            console.log("==========================================");
            console.log("AMPDECK+ v2.0.0 - PLUGIN CONNECTED");
            console.log("Professional Edition - Modular Architecture");
            console.log("==========================================");
        };

        this.websocket.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                this.messageHandler(data);
            } catch (error) {
                logger.error('Failed to parse message:', error);
            }
        };

        this.websocket.onerror = (error) => {
            logger.error('WebSocket error:', error);
        };

        this.websocket.onclose = (event) => {
            if (this.isIntentionalClose) {
                logger.info('WebSocket closed intentionally');
                return;
            }

            logger.warn(`WebSocket closed unexpectedly (code: ${event.code})`);
            this.websocket = null;
            this.scheduleReconnect();
        };
    }

    /**
     * Schedule automatic reconnection
     */
    scheduleReconnect() {
        if (this.isIntentionalClose || this.reconnectTimer) {
            return;
        }

        this.reconnectAttempts++;
        
        // Exponential backoff: 3s, 6s, 12s, 24s, max 30s
        const delay = Math.min(
            TIMING.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
            TIMING.RECONNECT_MAX_DELAY
        );

        logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.port && this.pluginUUID && this.registerEvent) {
                this.connect(this.port, this.pluginUUID, this.registerEvent);
            }
        }, delay);
    }

    /**
     * Send message to Stream Deck
     */
    send(data) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(data));
            return true;
        } else {
            logger.warn('Cannot send message: WebSocket not connected');
            return false;
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    }

    /**
     * Close connection
     */
    close() {
        this.isIntentionalClose = true;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        logger.info('Connection closed');
    }

    /**
     * Get current WebSocket state
     */
    getState() {
        if (!this.websocket) return 'DISCONNECTED';
        
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        return states[this.websocket.readyState] || 'UNKNOWN';
    }
}

export default ConnectionManager;
