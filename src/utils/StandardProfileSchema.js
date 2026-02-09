/**
 * StandardProfileSchema.js
 * 
 * Defines the canonical structure for bot profiles (.json).
 * All profiles in /profiles should eventually follow this format.
 */
export const StandardProfileSchema = {
    name: "AgentName",

    // Core Identity
    bio: "Brief personality description.",

    // Brain Configuration
    model: {
        provider: "openai", // or "anthropic", "gemini", etc.
        model: "gpt-4o",
        params: {
            temperature: 0.7,
            max_tokens: 2048
        }
    },

    // Behavioral Modes (Legacy and New)
    modes: {
        self_preservation: true,
        unstuck: true,
        cowardice: false,
        self_defense: true,
        hunting: false,
        item_collecting: true,
        torch_placing: true,
        idle_staring: false,
        cheat: false
    },

    // Intelligence & Memory
    intelligence: {
        coding_enabled: true,
        learning_loop: true,
        skill_catalog: "default",
        max_retries: 3 // Max replan attempts
    },

    memory: {
        vector_enabled: true,
        graph_enabled: true,
        ram_persistence: true
    },

    // Security & Territoriality
    security: {
        whitelist: [], // Trusted players
        territorial_radius: 15,
        pvp_enabled: true
    },

    // Subsystem Services
    services: {
        cognee_url: "http://localhost:8001"
    },

    // Timing & Behavior Tuning
    behavior: {
        alert_cooldown: 10000, // Ms between alerts
        save_interval: 60000,  // Background persistence freq
        auto_eat_start: 14,
        banned_food: ["rotten_flesh", "spider_eye"],
        self_preservation: {
            low_health_threshold: 6, // 3 hearts
            critical_health_threshold: 4, // 2 hearts
            panic_distance: 10
        },
        priorities: {
            survival_base: 40,
            survival_multiplier: 4,
            hunger_base: 20,
            hunger_multiplier: 4.6
        }
    },

    timeouts: {
        recovery_interval: 5000,
        task_ttl: 60000 // Zombie task threshold
    },

    // System Internals (Audit Fix)
    system_intervals: {
        zombie_check: 10000,      // Check every 10s
        zombie_threshold: 60000,  // Kill if > 60s
        watchdog_check: 3000,     // Check physics every 3s
        memory_save: 60000        // Background save every 60s
    },

    // Mission Specifics
    task: "Complete survival and exploration.",
    blocked_actions: []
};
