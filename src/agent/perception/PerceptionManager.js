
import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * PerceptionManager
 * 
 * Central hub for processing sensory information.
 * - Aggregates data from EnvironmentMonitor (immediate surroundings)
 * - Updates SpatialMemory (short-term object persistence)
 * - Schedules Vision analysis (long-range/contextual understanding)
 * - Filters noise to reduce cognitive load on the Brain
 */
export class PerceptionManager {
    constructor(agent) {
        this.agent = agent;
        this.active = false;
        this.visionScheduler = null; // To be injected or instantiated

        // Configuration
        this.updateInterval = 500; // ms
        this.entities = new Map(); // Tracked entities in FOV
        this.blocks = new Map();   // Tracked significant blocks

        this._setupSignalListeners();
    }

    start() {
        if (this.active) return;
        this.active = true;
        console.log('[PerceptionManager] 👁️ Started sensory processing.');
    }

    stop() {
        this.active = false;
    }

    _setupSignalListeners() {
        // Listen to raw EnvironmentMonitor signals
        globalBus.subscribe(SIGNAL.ENV_ENTITY_ACTION, this._handleEntityAction.bind(this));
        globalBus.subscribe(SIGNAL.ENV_BLOCK_CHANGE, this._handleBlockChange.bind(this));
        globalBus.subscribe(SIGNAL.ENV_PLAYER_DETECTED, this._handlePlayerDetected.bind(this));
        globalBus.subscribe(SIGNAL.ENV_HOSTILE_APPROACHING, this._handleThreat.bind(this));
    }

    async _handleEntityAction(data) {
        if (!this.active) return;
        console.log(`[Perception] observed entity action: ${data.action} by ${data.entity}`);

        // Update Spatial Memory
        if (this.agent.spatialMemory) {
            await this.agent.spatialMemory.update([{
                type: 'entity',
                name: data.entity,
                position: data.position,
                distance: data.distance,
                confidence: 1.0,
                metadata: { action: data.action }
            }]);
        }
    }

    async _handleBlockChange(data) {
        if (!this.active) return;
        console.log(`[Perception] observed block change: ${data.old} -> ${data.new}`);

        if (this.agent.spatialMemory) {
            // If block became air, we might want to remove it or update it as 'air'
            // For now, we update the new state
            await this.agent.spatialMemory.update([{
                type: 'block',
                name: data.new,
                position: data.position,
                confidence: 1.0
            }]);
        }
    }

    async _handlePlayerDetected(data) {
        if (!this.active) return;
        console.log(`[Perception] 👤 Player detected: ${data.username}`);

        if (this.agent.spatialMemory) {
            await this.agent.spatialMemory.update([{
                type: 'player',
                name: data.username,
                position: data.position,
                confidence: 1.0
            }]);
        }

        // High priority event - could trigger vision if we haven't seen them in a while
        // this.visionScheduler.requestAnalysis(priority=HIGH);
    }

    async _handleThreat(data) {
        if (!this.active) return;
        // console.log(`[Perception] ⚠️ Threat: ${data.entity}`);

        // Report to High-Level Brain via Signal
        // (Actually globalBus emits this, Brain listens to it directly usually, 
        // but PerceptionManager could enrich it)
    }

    /**
     * Called by Vision system when analysis is complete
     */
    async ingestVisionResult(analysis) {
        if (!this.active || !analysis) return;
        console.log('[Perception] 🧠 Ingesting Vision Analysis');

        // Analysis might contain list of identified items/mobs
        // Update Spatial Memory with high confidence visual confirmation
        // TODO: parse analysis object
    }
}
