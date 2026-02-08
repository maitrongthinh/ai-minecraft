import { globalBus, SIGNAL } from '../core/SignalBus.js';
import settings from '../../../settings.js';

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
        if (!bot || !bot.entity) return this.THREAT_LEVELS.SAFE;

        const health = bot.health;
        const food = bot.food;

        // Use tactical settings if available
        const cautionThreshold = settings.auto_eat_start || 14;
        const criticalThreshold = Math.floor(cautionThreshold / 2.3); // Scale critical with caution

        // Critical physiological state
        if (health < criticalThreshold || food < criticalThreshold) return this.THREAT_LEVELS.CRITICAL;

        const nearbyHostiles = this.getNearbyHostiles(bot, settings.tactical?.territorial_radius || 10);

        if (nearbyHostiles.length > 2) return this.THREAT_LEVELS.CRITICAL;
        if (nearbyHostiles.length > 0) return this.THREAT_LEVELS.DANGER;

        if (health < 12 || food < cautionThreshold) return this.THREAT_LEVELS.CAUTION;

        return this.THREAT_LEVELS.SAFE;
    }

    /**
     * Helper to find nearby hostile mobs
     * @param {Bot} bot 
     * @param {number} range 
     */
    static getNearbyHostiles(bot, range) {
        if (!bot.entities) return [];

        const hostileNames = [
            'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
            'pillager', 'ravager', 'vindicator', 'evoker', 'phantom', 'drowned', 'husk'
        ];

        return Object.values(bot.entities).filter(e => {
            return (e.type === 'mob' || e.type === 'hostile') &&
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
        if (threatLevel === this.THREAT_LEVELS.SAFE) {
            return health >= 10 && food >= (settings.auto_eat_start || 14);
        } else if (threatLevel === this.THREAT_LEVELS.CAUTION) {
            return health >= 16 && food >= 18;
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
        // Use max_retries from settings
        const maxRetries = settings.tactical?.max_retries || 3;
        if (failureCount >= maxRetries) return false;

        const fatalErrors = [
            'Invalid config',
            'Missing dependency',
            'Authentication failed',
            'Goal impossible',
            'Inventory full',
            'Security error',
            'Fatal',
            'ReferenceError',
            'SyntaxError'
        ];

        if (fatalErrors.some(e => errorReason.includes(e))) {
            return false;
        }

        return true;
    }
}
