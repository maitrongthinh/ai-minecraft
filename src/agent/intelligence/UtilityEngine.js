import settings from '../../../settings.js';
import { SurvivalAnalysis } from './SurvivalAnalysis.js';

/**
 * UtilityEngine - Dynamic Scoring for Action Priorities
 * 
 * Replaces static priority numbers with context-aware heuristics.
 * Scales priorities based on Health, Hunger, Threat Level, and Time.
 */
export class UtilityEngine {
    constructor(agent) {
        this.agent = agent;
        this.weights = settings.tactical?.weights || {
            health: 5,
            hunger: 2,
            threat: 10,
            time: 1
        };
    }

    /**
     * Calculate a priority score (0-100) for a given state
     * @param {string} stateName - Name of the state (e.g., 'combat', 'eat', 'social')
     * @returns {number} Priority score
     */
    calculatePriority(stateName) {
        const bot = this.agent.bot;
        if (!bot) return 0;

        let score = 0;
        const normalizedHealth = bot.health; // 0-20
        const normalizedFood = bot.food;     // 0-20
        const threatLevel = SurvivalAnalysis.getThreatLevel(bot); // 0-3

        const name = stateName.toLowerCase();

        if (name === 'combat' || name === 'self_defense') {
            // Combat priority scales heavily with threat
            score = 40 + (threatLevel * this.weights.threat);

            // Desperation factor: if health is very low, combat priority might drop in favor of 'retreat'
            // unless it's self-defense.
            if (normalizedHealth < 6 && threatLevel > 1) {
                score += 10; // Fight for your life!
            }
        }
        else if (name === 'eat' || name === 'healing' || name === 'survival') {
            // Priority = Hunger/Health deficit * weights
            const healthScarcity = (20 - normalizedHealth) * this.weights.health;
            const foodScarcity = (20 - normalizedFood) * this.weights.hunger;

            score = Math.max(healthScarcity, foodScarcity);

            // Critical floor: if either is critical, jump to high priority
            if (normalizedHealth < 6 || normalizedFood < 6) {
                score = Math.max(score, 85);
            }
        }
        else if (name === 'social' || name === 'conversation') {
            score = 30; // Base social priority
            // Drop social priority if survival needs are high
            const deficit = (20 - normalizedHealth) + (20 - normalizedFood);
            score -= deficit;
        }
        else if (name === 'idle' || name === 'exploration') {
            score = 20;
            // Time of day factor: safer to explore during day
            const isDay = bot.time && bot.time.timeOfDay < 13000;
            if (isDay) score += 10;
        }
        else {
            score = 50; // Neutral default
        }

        // Clamp 0-100
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Update weights dynamically (e.g. from profile or learning)
     * @param {Object} newWeights 
     */
    updateWeights(newWeights) {
        this.weights = { ...this.weights, ...newWeights };
    }
}
