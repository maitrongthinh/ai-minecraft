import { globalBus, SIGNAL } from '../core/SignalBus.js';
import * as skills from '../../skills/library/movement_skills.js';
import * as world from '../../skills/library/world.js';

/**
 * SelfPreservationReflex.js
 * 
 * Handles immediate physical threats:
 * - Drowning
 * - Burning (Lava/Fire)
 * - Suffocation
 * - Drowning
 * - Burning (Lava/Fire)
 * - Suffocation
 * - Falling (Delegated to FallDamageReflex)
 * 
 * Priority: CRITICAL (Interrupts everything)
 */
export class SelfPreservationReflex {
    constructor(agent) {
        this.agent = agent;
        // this.bot is managed in tick() to ensure it's always current
        this.active = false;
        this.fall_blocks = ['sand', 'gravel', 'concrete_powder', 'anvil'];
        this.fallReflex = null;
        this.intervalId = null;
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.intervalId = setInterval(() => this.tick(), 100); // Check every 100ms
        console.log('[SelfPreservationReflex] Active.');
    }

    stop() {
        this.active = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    _getRulePolicy() {
        // 1. High Priority: Genetic Instincts (Evolution)
        if (this.agent?.evolution) {
            const health = this.agent.evolution.getTrait('survival_health_threshold');
            const panic = this.agent.evolution.getTrait('survival_panic_distance');
            if (health !== null && panic !== null) {
                return {
                    low_health_threshold: health,
                    panic_distance: panic,
                    drowning_tolerance: this.agent.evolution.getTrait('survival_drowning_tolerance') || 10
                };
            }
        }

        // 2. Medium Priority: Behavior Rules
        if (!this.agent?.behaviorRuleEngine || typeof this.agent.behaviorRuleEngine.getSelfPreservationPolicy !== 'function') {
            return this.agent.config.profile?.behavior?.self_preservation || {};
        }

        try {
            return this.agent.behaviorRuleEngine.getSelfPreservationPolicy({
                health: this.bot?.health,
                lastDamageTime: this.bot?.lastDamageTime
            });
        } catch {
            return this.agent.config.profile?.behavior?.self_preservation || {};
        }
    }

    async tick() {
        this.bot = this.agent?.bot || null;
        if (!this.bot || !this.bot.entity) return;

        // Critical Status Checks
        const block = this.bot.blockAt(this.bot.entity.position);
        const blockAbove = this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0));

        if (!block || !blockAbove) return; // World not loaded?

        // 1. Drowning / Water check
        if (blockAbove.name === 'water' || block.name === 'water') {
            const policy = this._getRulePolicy();
            const tolerance = policy.drowning_tolerance || 10;
            const oxygen = this.bot.oxygenLevel;
            if (oxygen < tolerance) { // Panic if oxygen is low based on genetics
                await this.handleDrowning();
            }
        }

        // 2. Falling Blocks (Suffocation risk)
        if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
            await this.handleSuffocation();
        }

        // 3. Fire / Lava
        if (this.isBurning(block, blockAbove)) {
            await this.handleBurning(block);
        }

        // 4. Low Health Panic (if taking damage)
        const policy = this._getRulePolicy();
        const lowHealthThreshold = policy.low_health_threshold || 6;
        if (this.bot.health < lowHealthThreshold && (Date.now() - this.bot.lastDamageTime < 2000)) {
            await this.handleLowHealth();
        }

        // 5. Fall Damage (Delegated)
        // 5. Fall Damage (Delegated)
        if (!this.fallReflex && this.agent.reflexes) {
            this.fallReflex = this.agent.reflexes.fallDamage;
        }
        if (this.fallReflex && !this.fallReflex.active) {
            this.fallReflex.start();
        }
    }

    isBurning(block, blockAbove) {
        return (block.name === 'lava' || block.name === 'fire' ||
            blockAbove.name === 'lava' || blockAbove.name === 'fire' ||
            this.bot.entity.onFire);
    }

    async handleDrowning() {
        console.log('[Reflex] 💧 Drowning detected! Swimming up...');
        this.active = true;
        this.agent.requestInterrupt();

        // Simple swim up
        this.bot.setControlState('jump', true);
        await new Promise(r => setTimeout(r, 1000));
        this.active = false;

        // Report to EvolutionEngine
        if (this.agent?.evolution) {
            this.agent.evolution.recordSurvivalEvent('drowning', this.bot.health > 0);
        }
    }

    async handleSuffocation() {
        console.log('[Reflex] 🧱 Suffocation detected! Moving away...');
        this.active = true;
        this.agent.requestInterrupt();

        await skills.moveAway(this.bot, 2);
        this.active = false;
    }

    async handleBurning(block) {
        console.log('[Reflex] 🔥 Burning detected! Extinguishing...');
        this.active = true;
        this.agent.requestInterrupt();

        // 1. Try Water Bucket
        let waterBucket = this.bot.inventory.items().find(item => item.name === 'water_bucket');
        if (waterBucket) {
            const pos = block.name === 'fire' ? block.position : this.bot.entity.position;
            await this.bot.equip(waterBucket, 'hand');
            await this.bot.activateItem(); // Place water
            console.log('[Reflex] Used water bucket!');
            this.active = false;
            if (this.agent?.evolution) this.agent.evolution.recordSurvivalEvent('burning', true);
            return;
        }

        // 2. Run to water
        let nearestWater = world.getNearestBlock(this.bot, 'water', 15);
        if (nearestWater) {
            const pos = nearestWater.position;
            await skills.goToPosition(this.bot, pos.x, pos.y, pos.z, 0.5);
        } else {
            // 3. Move away blindly
            await skills.moveAway(this.bot, 5);
        }

        this.active = false;
        if (this.agent?.evolution) this.agent.evolution.recordSurvivalEvent('burning', this.bot.health > 0);
    }

    async handleLowHealth() {
        if (this.active) return;

        // Dynamic Config
        const config = this._getRulePolicy();
        const threshold = config.critical_health_threshold || 4;
        const panicDist = config.panic_distance || 10;

        if (this.bot.health < threshold) {
            console.log(`[Reflex] 💔 Critical Health (<${threshold})! Running away...`);
            this.active = true;
            this.agent.requestInterrupt();

            await skills.moveAway(this.bot, panicDist);
            this.active = false;

            // Report to EvolutionEngine
            if (this.agent?.evolution) {
                this.agent.evolution.recordSurvivalEvent('low_health', this.bot.health > 0);
            }
        }
    }
}

