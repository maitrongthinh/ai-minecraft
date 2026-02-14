const settings = {
    "minecraft_version": "auto", // or specific version like "1.21.6"
    "host": "localhost", // or "localhost", "your.ip.address.here"
    "port": 5000, // Minecraft server port
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8092,
    "auto_open_ui": true, // opens UI in browser on startup

    "base_profile": "survival", // survival, assistant, creative, or god_mode
    "profiles": [
        "./profiles/groq.json",         // ⚡ GROQ (siêu nhanh, 200-800ms) - API KEY ĐÃ CÓ
        // "./andy.json",
        // "./profiles/qwen.json",         // Qwen Balanced (low reasoning)
        // "./profiles/qwen-deep.json",    // Qwen Deep (high reasoning)
        // "./profiles/gpt.json",
        // "./profiles/claude.json",
        // "./profiles/gemini.json",
        // "./profiles/llama.json",
        // "./profiles/grok.json",
        // "./profiles/mistral.json",
        // "./profiles/deepseek.json",
        // "./profiles/mercury.json",
        // "./profiles/andy-4.json", // Supports up to 75 messages!

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],

    "load_memory": true, // load memory from previous session
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
    "collaboration_mode": "survival", // survival, assist, collaborator
    "owner_username": "", // if set, assist mode only accepts errands from this player
    "teammate_agents": [], // agent names used in collaborator mode
    "obey_owner": true, // if true, non-owner assist requests are rejected when owner is set

    "speak": false,
    // allows all bots to speak through text-to-speech. 
    // specify speech model inside each profile with format: {provider}/{model}/{voice}.
    // if set to "system" it will use basic system text-to-speech. 
    // Works on windows and mac, but linux requires you to install the espeak package through your package manager eg: `apt install espeak` `pacman -S espeak`.

    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": false, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": true, // allows vision model to interpret screenshots as inputs
    "enable_adventure_log": true, // daily markdown adventure journal (and screenshot if vision enabled)
    "allow_offline_mode": true, // User Request: Defaults to true
    "blocked_actions": ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"], // commands to disable and remove from docs. Ex: ["!setMode"],
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 50, // MODE: UNLEASHED - MAX CONTEXT
    "num_examples": 5, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "show_command_syntax": "full", // "full", "shortened", or "none"
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots

    "spawn_timeout": 30, // num seconds allowed for the bot to spawn before throwing error. Increase when spawning takes a while.
    "block_place_delay": 0, // delay between placing blocks (ms) if using newAction. helps avoid bot being kicked by anti-cheat mechanisms on servers.

    "log_all_prompts": true, // log ALL prompts to file


    // Unified Brain Configuration
    // Users can now specify 'apiKeyEnv' to choose which environment variable to use for the API key.
    "models": {
        "high_iq": {
            "api": "groq",
            "model": "llama-3.3-70b-versatile",
            "apiKeyEnv": "GROQ_API_KEY",
            "uses": 1000,
            "rate_limit": 1000 // requests per 12h
        },
        "fast": {
            "api": "groq",
            "model": "llama-3.1-8b-instant",
            "apiKeyEnv": "GROQ_API_KEY",
            "uses": 1000,
            "rate_limit": 1000 // requests per 12h (default)
        }
    },

    // Cognee Memory Service Configuration
    "cognee_service_url": process.env.COGNEE_SERVICE_URL || "http://localhost:8001",

    // Watchdog Configuration (Anti-Stuck System)
    "watchdog": {
        "enabled": false, // User Request: Defaults to false
        "stuck_timeout_seconds": 180,   // Time before triggering emergency (3 min)
        "check_interval_ms": 3000       // How often to check position
    },

    // Mission Roadmap Configuration
    "mission": {
        "ladder_type": "vanilla",
        "server": { "host": "localhost", "port": 5000 },
        "execution_mode": "direct_task_execution",
        "task_cooldown_ms": 12000,
        "dimensions": {
            "allow_nether": true,
            "allow_end": true,
            "nether_search_radius": 500,
            "end_search_radius": 2000
        }
    },
    "base": {
        "mode": "full_base_plus_farm",
        "radius": 40
    },
    "defense": {
        "target_policy": "all_hostile_mobs_nearby",
        "radius": 18
    },
    "learning": {
        "teaching_scope": "all_players_with_trust_score",
        "apply_mode": "hard_immediate_override",
        "override_scope": "global",
        "promotion_cadence": "nightly_gated"
    },

    "tactical": {
        "max_retries": 3,
        "recovery_interval": 5000,
        "territorial_radius": 15,
        "weights": {
            "survival": 0.8,
            "mission": 0.6,
            "exploration": 0.4
        }
    },

    "objective": "Beat Minecraft", // Default long-term goal

    // Survival Thresholds
    "critical_health": 8,
    "critical_food": 6
}

if (process.env.SETTINGS_JSON) {
    try {
        Object.assign(settings, JSON.parse(process.env.SETTINGS_JSON));
    } catch (err) {
        console.error("Failed to parse SETTINGS_JSON:", err);
    }
}

// FORCE FIX: Ensure high_iq uses Groq
settings.models.high_iq = {
    api: "groq",
    model: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQCLOUD_API_KEY", // Corrected env name
    uses: 1000,
    rate_limit: 1000
};

// console.log('[DEBUG] settings.js Loaded. Models:', JSON.stringify(settings.models, null, 2));

export default settings;
