export class RequestQueue {
    constructor(options = {}) {
        this.queue = [];
        this.processing = false;
        this.requestsPerMinute = options.requestsPerMinute || 15;
        this.lastRequestTime = 0;
        this.circuitBreaker = {
            failures: 0,
            threshold: 5,
            resetTimeout: 30000, // 30s
            isOpen: false,
            lastFailureTime: 0
        };
        // Priorities: Higher number = Higher priority
        this.PRIORITY = {
            CRITICAL: 10, // Combat, Save
            HIGH: 5,      // Navigation, Crafting
            NORMAL: 1,    // Chat, Inventory
            LOW: 0        // Idle thoughts, background analysis
        };
        this.backoff = {
            baseDelay: 1000,
            maxDelay: 60000,
            attempts: 3
        };
    }

    /**
     * Add a request to the queue
     * @param {Function} requestFn - Async function that returns the API response
     * @param {Object} options - { priority, retries }
     * @returns {Promise}
     */
    add(requestFn, options = {}) {
        return new Promise((resolve, reject) => {
            const priority = options.priority || this.PRIORITY.NORMAL;
            const item = {
                requestFn,
                priority,
                resolve,
                reject,
                retries: options.retries || this.backoff.attempts,
                attemptCount: 0,
                timestamp: Date.now()
            };

            this.queue.push(item);
            this.queue.sort((a, b) => b.priority - a.priority); // Descending priority

            this.process();
        });
    }

    async process() {
        if (this.processing) return;
        if (this.queue.length === 0) return;

        // Check Circuit Breaker
        if (this.circuitBreaker.isOpen) {
            if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTimeout) {
                console.log('[RequestQueue] Circuit Half-Open: Testing connection...');
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failures = 0;
            } else {
                console.warn('[RequestQueue] Circuit Open: Pausing requests.');
                setTimeout(() => this.process(), 5000);
                return;
            }
        }

        // Rate Limiting (Simple Token Bucket-ish)
        const now = Date.now();
        const interval = 60000 / this.requestsPerMinute;
        const timeSinceLast = now - this.lastRequestTime;

        if (timeSinceLast < interval) {
            setTimeout(() => this.process(), interval - timeSinceLast);
            return;
        }

        this.processing = true;
        const item = this.queue.shift();
        this.lastRequestTime = Date.now();

        try {
            item.attemptCount++;
            const result = await item.requestFn();
            item.resolve(result);
            this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1); // Recover slowly
        } catch (error) {
            console.error(`[RequestQueue] Request failed (Attempt ${item.attemptCount}/${item.retries}): ${error.message}`);

            // Check for 429 or 5xx
            const isRateLimit = error.message.includes('429') || error.status === 429;
            const isServerErr = error.message.includes('500') || error.message.includes('503');

            if ((isRateLimit || isServerErr) && item.attemptCount <= item.retries) {
                // Exponential Backoff
                const delay = Math.min(
                    this.backoff.baseDelay * Math.pow(2, item.attemptCount),
                    this.backoff.maxDelay
                );
                console.log(`[RequestQueue] Retrying in ${delay}ms...`);

                // Re-queue with same priority but delayed
                // this.queue.unshift(item); // REMOVED: setTimeout below handles push back.
                // Re-sort isn't needed if we unshift, but let's push and sort to be safe if priority changes dynamic (unlikely)
                // Actually, just wait and retry this specific item logic is cleaner in the loop:

                // We actually moved it out of queue. Let's put it back.
                // But we can't block the queue processing for the backoff duration if async.
                // However, for rate limits, we PROBABLY want to block slightly.

                setTimeout(() => {
                    this.queue.push(item);
                    this.queue.sort((a, b) => b.priority - a.priority);
                    this.processing = false;
                    this.process();
                }, delay);

                return; // Early return, processing flag stays true until timeout resets it via new process call? 
                // Wait, if I return here, processing is true. 
                // The timeout calls process() which checks `processing`.
                // I need to set processing = false inside timeout? No, process() won't run.
                // Correct logic:
                // processing = false (now) -> wait -> process()
                // But I also need to make sure I don't run other requests immediately if it was a rate limit.

            } else {
                // Max retries reached or fatal error
                this.circuitBreaker.failures++;
                if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
                    this.circuitBreaker.isOpen = true;
                    this.circuitBreaker.lastFailureTime = Date.now();
                }
                item.reject(error);
            }
        }

        this.processing = false;
        this.process(); // Next
    }
}
