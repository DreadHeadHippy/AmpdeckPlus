/**
 * Plex Authentication & Discovery
 * Handles PIN-based OAuth flow, server discovery, and player detection
 */

import { PLEX } from '../core/constants.js';
import logger from '../utils/logger.js';

/**
 * Phase 1: Plex PIN-based OAuth flow
 */
export class PlexPinAuth {
    constructor() {
        this.pinId = null;
        this.pin = null;
        this.pollTimer = null;
    }

    /**
     * Start the PIN auth flow
     * @returns {Promise<{pin: string, authUrl: string}>}
     */
    async startAuth() {
        // Kill any stale poll cycle from a previous auth attempt
        this.cleanup();

        const headers = {
            'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
            'X-Plex-Product': 'Ampdeck+',
            'X-Plex-Version': '2.0.0',
            'X-Plex-Platform': 'Stream Deck',
            'X-Plex-Device': 'Stream Deck',
            'Accept': 'application/json'
        };

        try {
            const response = await fetch('https://plex.tv/api/v2/pins?strong=true', {
                method: 'POST',
                headers
            });

            if (!response.ok) {
                throw new Error(`Failed to create PIN: HTTP ${response.status}`);
            }

            const data = await response.json();
            this.pinId = data.id;
            this.pin = data.code;

            const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(PLEX.CLIENT_IDENTIFIER)}&code=${encodeURIComponent(this.pin)}&context[device][product]=Ampdeck%2B`;

            logger.debug('PIN auth started', { pinId: this.pinId });

            return {
                pin: this.pin,
                authUrl
            };
        } catch (error) {
            logger.error('Failed to start PIN auth', error);
            throw error;
        }
    }

    /**
     * Poll for auth token (call repeatedly until success or timeout)
     * @returns {Promise<string|null>} Auth token if available, null otherwise
     */
    async checkAuth() {
        if (!this.pinId) {
            throw new Error('No PIN auth in progress');
        }

        const headers = {
            'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
            'Accept': 'application/json'
        };

        try {
            const response = await fetch(`https://plex.tv/api/v2/pins/${this.pinId}`, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                throw new Error(`Failed to check PIN: HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.authToken) {
                logger.info('PIN auth successful');
                this.cleanup();
                return data.authToken;
            }

            return null;
        } catch (error) {
            logger.error('Failed to check PIN auth', error);
            throw error;
        }
    }

    /**
     * Start polling for auth completion
     * @param {Function} onSuccess - Callback when token received
     * @param {Function} onError - Callback on error
     * @param {number} maxAttempts - Maximum poll attempts (default: 100 = ~5 min at 3s interval)
     */
    startPolling(onSuccess, onError, maxAttempts = 100) {
        let attempts = 0;
        let inFlight = false;

        this.pollTimer = setInterval(async () => {
            if (inFlight) return;
            inFlight = true;

            try {
                attempts++;

                if (attempts > maxAttempts) {
                    this.cleanup();
                    onError(new Error('PIN auth timeout - please try again'));
                    return;
                }

                const token = await this.checkAuth();
                if (token) {
                    onSuccess(token);
                }
            } catch (error) {
                this.cleanup();
                onError(error);
            } finally {
                inFlight = false;
            }
        }, 3000); // Poll every 3 seconds
    }

    /**
     * Stop polling and clean up
     */
    cleanup() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.pinId = null;
        this.pin = null;
    }
}

/**
 * Phase 2: Discover Plex servers via plex.tv resources
 */
export async function discoverServers(authToken) {
    const headers = {
        'X-Plex-Token': authToken,
        'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
        'Accept': 'application/json'
    };

    try {
        const response = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=0', {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            throw new Error(`Failed to discover servers: HTTP ${response.status}`);
        }

        const resources = await response.json();

        // Include all servers the user has access to (owned + shared)
        const servers = resources.filter(r => 
            r.provides && 
            r.provides.includes('server') && 
            r.connections && 
            r.connections.length > 0
        );

        const ownedCount = servers.filter(s => s.owned).length;
        logger.info(`Found ${servers.length} Plex server(s) (${ownedCount} owned, ${servers.length - ownedCount} shared) from ${resources.length} total resources`);

        return servers.map(server => ({
            name: server.name,
            clientIdentifier: server.clientIdentifier,
            connections: server.connections,
            owned: server.owned
        }));
    } catch (error) {
        logger.error('Failed to discover servers', error);
        throw error;
    }
}

/**
 * Find the best (fastest, most local) server connection
 * @param {Object} server - Server object from discoverServers
 * @param {string} authToken - Auth token
 * @returns {Promise<string|null>} Best connection URI or null
 */
export async function findBestServerConnection(server, authToken) {
    logger.info(`Finding best connection for server: ${server.name}`);
    logger.info(`Available connections: ${JSON.stringify(server.connections.map(c => ({ uri: c.uri, local: c.local, relay: c.relay })))}`);

    // Plex uses plex.direct DNS for ALL connections (including local ones), so
    // filter on the relay property, not the URL pattern.
    // For local plex.direct connections, decode the embedded IP to get http://IP:PORT.
    const nonRelayConnections = [...server.connections]
        .filter(conn => {
            if (conn.relay === true) {
                logger.debug(`Skipping relay connection: ${conn.uri}`);
                return false;
            }
            return true;
        })
        .sort((a, b) => {
            // Prefer local connections first
            if (a.local && !b.local) return -1;
            if (!a.local && b.local) return 1;
            return 0;
        });

    if (nonRelayConnections.length > 0) {
        const best = nonRelayConnections[0];
        let finalUri = best.uri;

        // Decode local plex.direct hostnames to a direct http://IP:PORT URL
        if (best.local && best.uri.includes('.plex.direct')) {
            try {
                const url = new URL(best.uri);
                const firstSegment = url.hostname.split('.')[0];
                if (/^\d+-\d+-\d+-\d+$/.test(firstSegment)) {
                    const ip = firstSegment.replace(/-/g, '.');
                    const port = url.port || '32400';
                    // Always use http:// for raw IP — preserving https: would cause TLS cert
                    // mismatch because the cert is for *.plex.direct, not the bare IP.
                    finalUri = `http://${ip}:${port}`;
                    logger.info(`Decoded local plex.direct to direct IP: ${best.uri} => ${finalUri}`);
                }
            } catch {}
        }

        logger.info(`Selected connection: ${finalUri} (local: ${best.local})`);
        return finalUri;
    }

    // Fall back to relay as last resort
    const relayConn = server.connections.find(conn => conn.relay === true);
    if (relayConn) {
        logger.info(`No local connections available, using relay: ${relayConn.uri}`);
        return relayConn.uri;
    }

    logger.warn('No working server connections found');
    return null;
}

/**
 * Phase 3: Discover Plexamp player
 */

/**
 * Common Plexamp ports to probe
 */
const COMMON_PLEXAMP_PORTS = [
    32500, // Headless Plexamp
    32433  // Desktop Plexamp (alternative)
];

/**
 * Test if Plexamp is running on a specific port
 * @param {number} port - Port to test
 * @returns {Promise<boolean>}
 */
async function testPlexampPort(port) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

    try {
        const res = await fetch(`http://localhost:${port}/player/timeline/poll?wait=0`, {
            method: 'GET',
            headers: {
                'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER
            },
            signal: controller.signal
        });

        if (!res.ok) return false;

        const ct = res.headers.get('content-type') || '';
        const text = await res.text();

        // Validate the response looks like a Plexamp timeline (not PMS or an unrelated service)
        if (ct.includes('xml') || text.trimStart().startsWith('<')) {
            return text.includes('<MediaContainer') && text.includes('<Timeline');
        }
        if (ct.includes('json') || text.trimStart().startsWith('{')) {
            try {
                const j = JSON.parse(text);
                return !!j.MediaContainer;
            } catch { return false; }
        }
        return false;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Discover Plexamp via port probing (Option A)
 * @returns {Promise<string|null>} Player URL or null
 */
export async function discoverPlexampByProbing() {
    logger.debug('Probing for Plexamp player...');

    for (const port of COMMON_PLEXAMP_PORTS) {
        const found = await testPlexampPort(port);
        if (found) {
            const url = `http://localhost:${port}`;
            logger.info(`Found Plexamp via probing: ${url}`);
            return url;
        }
    }

    logger.debug('No Plexamp found via port probing');
    return null;
}

/**
 * Discover Plexamp via server's /clients endpoint (Option B)
 * @param {string} serverUrl - Server URL
 * @param {string} authToken - Auth token
 * @returns {Promise<string|null>} Player URL or null
 */
export async function discoverPlexampViaServer(serverUrl, authToken) {
    logger.debug('Checking server for active Plexamp clients...');

    try {
        const response = await fetch(`${serverUrl}/clients`, {
            method: 'GET',
            headers: {
                'X-Plex-Token': authToken,
                'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            return null;
        }

        // PMS may return XML even with Accept: application/json — handle both
        const contentType = response.headers.get('content-type') || '';
        let clients = [];

        if (contentType.includes('json')) {
            const data = await response.json();
            clients = data.MediaContainer?.Server || [];
        } else {
            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/xml');
            // PMS versions vary: some use <Server>, some use <Client>; address attr vs host
            clients = Array.from(doc.querySelectorAll('Server, Client')).map(el => ({
                product: el.getAttribute('product'),
                host: el.getAttribute('host') || el.getAttribute('address'),
                port: el.getAttribute('port')
            }));
        }

        // Look for Plexamp clients
        const plexampClient = clients.find(client => 
            client.product && client.product.toLowerCase().includes('plexamp')
        );

        if (plexampClient && plexampClient.host && plexampClient.port) {
            const url = `http://${plexampClient.host}:${plexampClient.port}`;
            logger.info(`Found Plexamp via server clients: ${url}`);
            return url;
        }

        logger.debug('No Plexamp found in active clients');
        return null;
    } catch (error) {
        logger.debug('Failed to check server clients', error);
        return null;
    }
}

/**
 * Combined player discovery (probing first, then server fallback)
 * @param {string} serverUrl - Server URL (optional, for fallback)
 * @param {string} authToken - Auth token (optional, for fallback)
 * @returns {Promise<string|null>} Player URL or null
 */
export async function discoverPlexamp(serverUrl = null, authToken = null) {
    // Try port probing first (instant, no dependencies)
    let playerUrl = await discoverPlexampByProbing();
    if (playerUrl) {
        return playerUrl;
    }

    // Fallback to server clients if we have server info
    if (serverUrl && authToken) {
        playerUrl = await discoverPlexampViaServer(serverUrl, authToken);
        if (playerUrl) {
            return playerUrl;
        }
    }

    logger.info('Plexamp player not found');
    return null;
}

/**
 * Get user info from auth token
 */
export async function getUserInfo(authToken) {
    try {
        const response = await fetch('https://plex.tv/api/v2/user', {
            method: 'GET',
            headers: {
                'X-Plex-Token': authToken,
                'X-Plex-Client-Identifier': PLEX.CLIENT_IDENTIFIER,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get user info: HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            username: data.username,
            email: data.email,
            title: data.title || data.username
        };
    } catch (error) {
        logger.error('Failed to get user info', error);
        return null;
    }
}
