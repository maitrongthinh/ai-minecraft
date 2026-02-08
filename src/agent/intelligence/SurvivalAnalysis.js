import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * SurvivalAnalysis
 * 
 * centralized logic for determining the bot's safety and survival needs.
 * Replaces hardcoded "Magic Numbers" with semantic checks.
 */
export class SurvivalAnalysis {
    static THREAT_LEVELS = {
        SAFE: 0,
        CAUTION: 1,
        DANGER: 2,
        CRITICAL: 3
    };

    /**
     * Get the current threat level based on health, food, and surroundings.
     * @param {Bot} bot - The mineflayer bot instance
     * @returns {number} THREAT_LEVELS enum value
     */
    static getThreatLevel(bot) {
        if (!bot || !bot.entity) return this.THREAT_LEVELS.SAFE; // Assume safe if not logged in?

        const health = bot.health;
        const food = bot.food;

        // Critical physiological state
        if (health < 6 || food < 6) return this.THREAT_LEVELS.CRITICAL;

        // Check for nearby monsters
        // Note: this depends on mcdata being available or passed in? 
        // We'll use a simple heuristic for now: check for hostile mobs in 'entities'.
        // Ideally we pass in a helper or the context.
        // For now, let's assume 'bot' has access to its registry or we scan nearby entities.

        const nearbyHostiles = this.getNearbyHostiles(bot, 10);

        if (nearbyHostiles.length > 2) return this.THREAT_LEVELS.CRITICAL;
        if (nearbyHostiles.length > 0) return this.THREAT_LEVELS.DANGER;

        if (health < 12 || food < 10) return this.THREAT_LEVELS.CAUTION;

        return this.THREAT_LEVELS.SAFE;
    }

    /**
     * Helper to find nearby hostile mobs
     * @param {Bot} bot 
     * @param {number} range 
     */
    static getNearbyHostiles(bot, range) {
        if (!bot.entities) return [];

        // Basic list of common hostile mobs. 
        // In a full implementation, we'd use mcData.mobs[name].category === 'hostile'
        const hostileNames = [
            'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
            'pillager', 'ravager', 'vindicator', 'evoker', 'phantom', 'drowned', 'husk'
        ];

        return Object.values(bot.entities).filter(e => {
            return e.type === 'mob' &&
                hostileNames.includes(e.name) &&
                bot.entity.position.distanceTo(e.position) <= range;
        });
    }

    /**
     * Check if it is safe to attempt recovery (exit survival mode)
     * @param {Bot} bot 
     * @returns {boolean}
     */
    static isSafeToRecover(bot) {
        if (!bot) return true;

        const threatLevel = this.getThreatLevel(bot);
        const health = bot.health;
        const food = bot.food;

        // Dynamic Recovery Thresholds:
        // If no enemies nearby (SAFE), we can recover with lower health (e.g. 10).
        // If enemies caution (CAUTION), we need more health (e.g. 16).

        if (threatLevel === this.THREAT_LEVELS.SAFE) {
            return health >= 10 && food >= 10;
        } else if (threatLevel === this.THREAT_LEVELS.CAUTION) {
            return health >= 16 && food >= 14;
        }

        // Danger/Critical -> Not safe to recover
        return false;
    }

    /**
     * Determine if a task failure is retryable
     * @param {string} errorReason - The error message/reason
     * @param {number} failureCount - Current number of failures
     * @returns {boolean}
     */
    static shouldRetry(errorReason, failureCount) {
        // Hard limit
        if (failureCount >= 3) return false;

        const fatalErrors = [
            'Invalid config',
            'Missing dependency',
            'Authentication failed',
            'Goal impossible',
            'Inventory full', // Sometimes retryable if we dump items, but for now treat as fatal for simple tasks
        ];

        if (fatalErrors.some(e => errorReason.includes(e))) {
            return false;
        }

        return true;
    }
}
