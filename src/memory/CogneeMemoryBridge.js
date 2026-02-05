import { VectorStore } from './VectorStore.js';

/**
 * CogneeMemoryBridge - Bridge between Node.js and Cognee Python Service
 * 
 * Features:
 * - Retry logic (3 attempts with exponential backoff)
 * - Timeout handling (10s per request)
 * - Automatic fallback to VectorStore when service unavailable
 * - Health monitoring with auto-recovery
 * - World isolation via world_id
 */
export class CogneeMemoryBridge {
    constructor(agent, serviceUrl = 'http://localhost:8001') {
        this.agent = agent;
        this.serviceUrl = serviceUrl;
        this.vectorStore = new VectorStore(agent); // Fallback memory

        // Service health state
        this.serviceAvailable = false;
        this.lastHealthCheck = 0;
        this.healthCheckInterval = 60000; // Check every 60s when degraded

        // Configuration
        this.maxRetries = 3;
        this.requestTimeout = 10000; // 10 seconds
        this.retryDelays = [1000, 2000, 4000]; // Exponential backoff

        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            fallbackRequests: 0
        };

        console.log('[CogneeMemoryBridge] Initialized with service:', serviceUrl);

        // Initial health check (don't wait for it)
        this.healthCheck().catch(() => {
            console.log('[CogneeMemoryBridge] Service not available yet, will retry later.');
        });
    }

    /**
     * Initialize the bridge (called by agent startup)
     */
    async init() {
        // Initialize VectorStore fallback
        await this.vectorStore.init();

        // Try initial health check
        try {
            await this.healthCheck();
            console.log('[CogneeMemoryBridge] ✓ Connected to Cognee service');
        } catch (err) {
            console.warn('[CogneeMemoryBridge] ⚠ Cognee service unavailable, using VectorStore fallback');
        }
    }

    /**
     * Health check endpoint
     * @returns {Promise<boolean>} Service health status
     */
    async healthCheck() {
        try {
            const response = await this._fetchWithTimeout(
                `${this.serviceUrl}/health`,
                { method: 'GET' },
                5000 // Shorter timeout for health check
            );

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }

            const data = await response.json();
            this.serviceAvailable = data.cognee_initialized === true;
            this.lastHealthCheck = Date.now();

            if (this.serviceAvailable) {
                console.log('[CogneeMemoryBridge] ✓ Service healthy');
            } else {
                console.warn('[CogneeMemoryBridge] ⚠ Service running but Cognee not initialized');
            }

            return this.serviceAvailable;

        } catch (err) {
            this.serviceAvailable = false;
            this.lastHealthCheck = Date.now();
            console.error('[CogneeMemoryBridge] ✗ Health check failed:', err.message);
            return false;
        }
    }

    /**
     * Store experience/facts to memory
     * @param {string} worldId - Minecraft world identifier
     * @param {string[]} facts - Array of facts to remember
     * @param {Object} metadata - Optional metadata
     * @returns {Promise<Object>} Response with success status
     */
    async storeExperience(worldId, facts, metadata = {}) {
        this.stats.totalRequests++;

        // Validate inputs
        if (!worldId || !facts || facts.length === 0) {
            console.error('[CogneeMemoryBridge] Invalid input:', { worldId, factsCount: facts?.length });
            return { success: false, error: 'Invalid input parameters' };
        }

        // Check if we should attempt service or go straight to fallback
        if (this._shouldFallback()) {
            console.log('[CogneeMemoryBridge] Using VectorStore fallback (service degraded)');
            return await this._fallbackStore(facts, metadata);
        }

        // Try Cognee service with retry
        try {
            const response = await this._fetchWithRetry(
                `${this.serviceUrl}/remember`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ world_id: worldId, facts, metadata })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Service error ${response.status}: ${error}`);
            }

            const data = await response.json();
            this.stats.successfulRequests++;
            this.serviceAvailable = true;

            console.log(`[CogneeMemoryBridge] ✓ Stored ${data.facts_stored} facts to world: ${worldId}`);
            return data;

        } catch (err) {
            console.error('[CogneeMemoryBridge] ✗ Failed to store via service:', err.message);
            this.stats.failedRequests++;

            // Fallback to VectorStore
            console.log('[CogneeMemoryBridge] → Falling back to VectorStore');
            return await this._fallbackStore(facts, metadata);
        }
    }

    /**
     * Recall facts from memory
     * @param {string} worldId - Minecraft world identifier
     * @param {string} query - Query string
     * @param {number} limit - Maximum results to return
     * @returns {Promise<Object>} Response with results
     */
    async recall(worldId, query, limit = 5) {
        this.stats.totalRequests++;

        // Validate inputs
        if (!worldId || !query) {
            console.error('[CogneeMemoryBridge] Invalid recall input:', { worldId, query });
            return { success: false, results: [], count: 0 };
        }

        // Check if we should use fallback
        if (this._shouldFallback()) {
            console.log('[CogneeMemoryBridge] Using VectorStore fallback for recall');
            return await this._fallbackRecall(query, limit);
        }

        // Try Cognee service with retry
        try {
            const response = await this._fetchWithRetry(
                `${this.serviceUrl}/recall`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ world_id: worldId, query, limit })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Service error ${response.status}: ${error}`);
            }

            const data = await response.json();
            this.stats.successfulRequests++;
            this.serviceAvailable = true;

            console.log(`[CogneeMemoryBridge] ✓ Recalled ${data.count} results for: "${query}"`);
            return data;

        } catch (err) {
            console.error('[CogneeMemoryBridge] ✗ Failed to recall via service:', err.message);
            this.stats.failedRequests++;

            // Fallback to VectorStore
            console.log('[CogneeMemoryBridge] → Falling back to VectorStore for recall');
            return await this._fallbackRecall(query, limit);
        }
    }

    /**
     * Clear memory for a specific world
     * @param {string} worldId - World identifier to clear
     * @returns {Promise<Object>} Clear operation result
     */
    async clearWorld(worldId) {
        if (!worldId) {
            console.error('[CogneeMemoryBridge] Invalid worldId for clear');
            return { success: false, error: 'Invalid worldId' };
        }

        try {
            const response = await this._fetchWithTimeout(
                `${this.serviceUrl}/clear_world/${worldId}`,
                { method: 'DELETE' },
                this.requestTimeout
            );

            if (!response.ok) {
                throw new Error(`Clear failed: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[CogneeMemoryBridge] ✓ Cleared world: ${worldId}`);
            return data;

        } catch (err) {
            console.error(`[CogneeMemoryBridge] ✗ Failed to clear world ${worldId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get bridge statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            serviceAvailable: this.serviceAvailable,
            fallbackRate: this.stats.totalRequests > 0
                ? (this.stats.fallbackRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    // ========== PRIVATE METHODS ==========

    /**
     * Determine if should fallback to VectorStore
     * @returns {boolean}
     */
    _shouldFallback() {
        // If service is known to be down and health check interval not passed
        if (!this.serviceAvailable && (Date.now() - this.lastHealthCheck < this.healthCheckInterval)) {
            return true;
        }

        // If it's been a while since last health check, try again
        if (!this.serviceAvailable && (Date.now() - this.lastHealthCheck >= this.healthCheckInterval)) {
            // Trigger background health check (don't wait for it)
            this.healthCheck().catch(() => { });
        }

        return !this.serviceAvailable;
    }

    /**
     * Fetch with retry logic
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<Response>}
     */
    async _fetchWithRetry(url, options) {
        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await this._fetchWithTimeout(url, options, this.requestTimeout);
                return response;

            } catch (err) {
                lastError = err;

                if (attempt < this.maxRetries - 1) {
                    const delay = this.retryDelays[attempt];
                    console.log(`[CogneeMemoryBridge] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms...`);
                    await this._sleep(delay);
                }
            }
        }

        throw lastError;
    }

    /**
     * Fetch with timeout
     * @param {string} url
     * @param {Object} options
     * @param {number} timeout
     * @returns {Promise<Response>}
     */
    async _fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;

        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw err;
        }
    }

    /**
     * Fallback: Store to VectorStore
     * @param {string[]} facts
     * @param {Object} metadata
     */
    async _fallbackStore(facts, metadata) {
        this.stats.fallbackRequests++;

        try {
            for (const fact of facts) {
                await this.vectorStore.add(fact, metadata);
            }

            return {
                success: true,
                world_id: 'fallback',
                facts_stored: facts.length,
                message: 'Stored to VectorStore fallback',
                fallback: true
            };

        } catch (err) {
            console.error('[CogneeMemoryBridge] Fallback store failed:', err);
            return {
                success: false,
                error: err.message,
                fallback: true
            };
        }
    }

    /**
     * Fallback: Recall from VectorStore
     * @param {string} query
     * @param {number} limit
     */
    async _fallbackRecall(query, limit) {
        this.stats.fallbackRequests++;

        try {
            const results = await this.vectorStore.search(query, limit);

            return {
                success: true,
                world_id: 'fallback',
                query: query,
                results: results.map(r => r.text),
                count: results.length,
                fallback: true
            };

        } catch (err) {
            console.error('[CogneeMemoryBridge] Fallback recall failed:', err);
            return {
                success: false,
                query: query,
                results: [],
                count: 0,
                error: err.message,
                fallback: true
            };
        }
    }

    /**
     * Sleep utility
     * @param {number} ms
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
