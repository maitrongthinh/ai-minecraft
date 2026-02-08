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
        skill_catalog: "default"
    },

    memory: {
        vector_enabled: true,
        graph_enabled: true,
        ram_persistence: true
    },

    // Mission Specifics
    task: "Complete survival and exploration.",
    blocked_actions: []
};
