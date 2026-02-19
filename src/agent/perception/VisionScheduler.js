
/**
 * VisionScheduler
 * 
 * Manages access to the Vision system (Screenshot + LLM).
 * Prevents spamming expensive API calls and prioritizes critical visual queries.
 */
export class VisionScheduler {
    constructor(agent) {
        this.agent = agent;
        this.queue = [];
        this.processing = false;
        this.lastAnalysisTime = 0;
        this.cooldown = 5000; // 5 seconds between autonomous scans
    }

    /**
     * Request a visual analysis
     * @param {string} reason - Why do we need vision? (e.g. "navigation_fail", "user_query")
     * @param {number} priority - 1 (Low) to 10 (Critical)
     */
    requestAnalysis(reason, priority = 1) {
        // Deduplicate requests
        if (this.queue.find(q => q.reason === reason)) return;

        this.queue.push({ reason, priority, timestamp: Date.now() });
        this.queue.sort((a, b) => b.priority - a.priority);

        this._processQueue();
    }

    async _processQueue() {
        if (this.processing) return;
        if (this.queue.length === 0) return;

        const now = Date.now();
        const topRequest = this.queue[0];

        // Check cooldown for low priority autonomous checks
        if (topRequest.priority < 5 && (now - this.lastAnalysisTime < this.cooldown)) {
            return; // Wait for cooldown
        }

        this.processing = true;
        const request = this.queue.shift();

        try {
            console.log(`[VisionScheduler] 👁️ Processing vision request: ${request.reason} (Pri: ${request.priority})`);

            if (this.agent.vision) {
                const analysis = await this.agent.vision.analyzeScene(request.reason);

                // Feed result back to PerceptionManager
                if (this.agent.perceptionManager) {
                    await this.agent.perceptionManager.ingestVisionResult(analysis);
                }
            } else {
                console.warn('[VisionScheduler] Vision module not enabled/available.');
            }

            this.lastAnalysisTime = Date.now();

        } catch (e) {
            console.error('[VisionScheduler] Analysis failed:', e);
        } finally {
            this.processing = false;
            // Check if more items in queue
            if (this.queue.length > 0) {
                setTimeout(() => this._processQueue(), 1000);
            }
        }
    }
}
