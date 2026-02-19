import fs from 'fs';
import path from 'path';
import { globalBus, SIGNAL } from './SignalBus.js';

/**
 * Blackboard - The Single Source of Truth
 * 
 * Implements the "Global Blackboard" architecture for MIND-SYNC v3.1.
 * - Stores real-time state of the bot.
 * - Accessed by Brain (Read/Write via OP), Actions (Read/Write), and Reflexes (Read).
 * - Persisted to disk asynchronously.
 */
export class Blackboard {
    constructor(agent) {
        this.agent = agent;
        this.filepath = path.join(process.cwd(), 'src/agent/memory/blackboard.json');
        this.data = this._load();
        this._dirty = false;
        this._pathCache = new Map(); // Phase 8: Optimization
        this._saveInterval = null;

        // Start auto-save loop
        this._startAutoSave();
    }

    /**
     * Load state from disk or initialize default
     */
    _load() {
        const defaults = this._getDefaultSchema();
        try {
            if (fs.existsSync(this.filepath)) {
                const raw = fs.readFileSync(this.filepath, 'utf8');
                const loaded = JSON.parse(raw);
                // Deep merge defaults with loaded to ensure new keys exist
                return {
                    ...defaults,
                    ...loaded,
                    system_flags: { ...defaults.system_flags, ...loaded.system_flags },
                    strategic_data: { ...defaults.strategic_data, ...loaded.strategic_data },
                    self_state: { ...defaults.self_state, ...loaded.self_state },
                    system2_state: { ...defaults.system2_state, ...loaded.system2_state }
                };
            }
        } catch (error) {
            console.error('[Blackboard] Failed to load data:', error);
        }
        return defaults;
    }

    _getDefaultSchema() {
        return {
            meta: { version: "3.1.0", last_update: Date.now() },
            system_flags: { network_status: "disconnected", is_combat_mode: false, is_sleeping: false, maintenance_mode: false },
            strategic_data: { home_coordinates: null, current_mission: "idle", death_count: 0 },
            social_context: { owner_name: null, trusted_players: [], enemies: [], last_interaction: null },
            inventory_cache: { totem_count: 0, arrows: 0, food_level: 20 },
            perception_snapshot: { nearest_threat: null, biome: "unknown" },
            self_state: { health: 20, food: 20, is_alive: true },
            system2_state: { active_goal: null, plan_phase: "idle", current_step: null, last_failure: null },
            swarm_state: { role: "lone_wolf", leader: null, peers_count: 0 }
        };
    }

    _startAutoSave() {
        // Save every 5 seconds if dirty
        this._saveInterval = setInterval(() => {
            if (this._dirty) {
                this.save();
            }
        }, 5000);
    }

    /**
     * Get a value by dot-notation path
     * @param {string} path - e.g. "strategic_data.current_mission"
     * @returns {any}
     */
    get(path) {
        if (!path) return this.data;

        // Phase 8: Cache check
        if (this._pathCache.has(path)) {
            const keys = this._pathCache.get(path);
            let val = this.data;
            for (const key of keys) {
                if (val === undefined || val === null) return undefined;
                val = val[key];
            }
            return val;
        }

        try {
            const keys = path.split('.');
            this._pathCache.set(path, keys); // Store for next time
            return keys.reduce((obj, key) => {
                if (obj === undefined || obj === null) {
                    throw new Error(`Cannot read property '${key}' of ${obj} (Path: ${path})`);
                }
                return (typeof obj[key] !== 'undefined') ? obj[key] : undefined;
            }, this.data);
        } catch (e) {
            console.error(`[Blackboard] 💥 GET ERROR for path "${path}":`, e.message);
            console.trace();
            throw e;
        }
    }

    /**
     * Set a value by dot-notation path
     * @param {string} path - e.g. "strategic_data.current_mission"
     * @param {any} value 
     * @param {string} source - Who is writing? (Debug purpose)
     */
    set(path, value, source = 'SYSTEM') {
        let keys = this._pathCache.get(path);
        if (!keys) {
            keys = path.split('.');
            this._pathCache.set(path, keys);
        }

        let obj = this.data;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {}; // Create path if missing
            obj = obj[keys[i]];
        }

        // Check for change
        if (obj[keys[keys.length - 1]] !== value) {
            obj[keys[keys.length - 1]] = value;
            this.data.meta.last_update = Date.now();
            this._dirty = true;

            // Emit update signal for reactive systems (like UI or Reflexes that watch vars)
            globalBus.emitSignal(SIGNAL.BLACKBOARD_UPDATE, { path, value, source });
        }
    }

    /**
     * Force save to disk
     */
    save() {
        try {
            fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2));
            this._dirty = false;
            // console.log('[Blackboard] State saved.');
        } catch (error) {
            console.error('[Blackboard] Save failed:', error);
        }
    }

    /**
     * Update simplified inventory cache (Called by Inventory events)
     */
    updateInventoryCache(bot) {
        if (!bot) return;
        const totems = bot.inventory.items().filter(i => i.name === 'totem_of_undying').length;
        const arrows = bot.inventory.items().filter(i => i.name === 'arrow').length;

        this.set('inventory_cache.totem_count', totems);
        this.set('inventory_cache.arrows', arrows);
        this.set('inventory_cache.food_level', bot.food);

        // Main hand
        const hand = bot.heldItem;
        this.set('inventory_cache.main_hand', hand ? hand.name : null);

        // Off hand
        const offhand = bot.inventory.slots[45];
        this.set('inventory_cache.off_hand', offhand ? offhand.name : null);
    }

    /**
     * Update vital stats (Called on health/food events)
     */
    updateVitals(bot) {
        if (!bot) return;
        this.set('self_state.health', bot.health, 'CORE_KERNEL');
        this.set('self_state.food', bot.food, 'CORE_KERNEL');
        this.set('self_state.is_alive', bot.health > 0, 'CORE_KERNEL');
    }

    /**
     * Update perception snapshot (Called by EnvironmentMonitor)
     */
    updatePerception(snapshot) {
        for (const [key, value] of Object.entries(snapshot)) {
            this.set(`perception_snapshot.${key}`, value, 'ENV_MONITOR');
        }
    }

    /**
     * Update System 2 state (Called by System2Loop)
     */
    updateSystem2(state) {
        for (const [key, value] of Object.entries(state)) {
            this.set(`system2_state.${key}`, value, 'SYSTEM2_LOOP');
        }
    }

    cleanup() {
        if (this._saveInterval) clearInterval(this._saveInterval);
        this.save();
    }
}
