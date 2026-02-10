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
 * - Falling (if possible)
 * 
 * Priority: CRITICAL (Interrupts everything)
 */
export class SelfPreservationReflex {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.active = false;
        this.fall_blocks = ['sand', 'gravel', 'concrete_powder', 'anvil'];
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
            const oxygen = this.bot.oxygenLevel;
            if (oxygen < 10) { // Only panic if oxygen is low
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
        const lowHealthThreshold = this.agent.config.profile?.behavior?.self_preservation?.low_health_threshold || 6;
        if (this.bot.health < lowHealthThreshold && (Date.now() - this.bot.lastDamageTime < 2000)) {
            await this.handleLowHealth();
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
    }

    async handleLowHealth() {
        if (this.active) return;

        // Dynamic Config
        const config = this.agent.config.profile?.behavior?.self_preservation || {};
        const threshold = config.critical_health_threshold || 4;
        const panicDist = config.panic_distance || 10;

        // Context Awareness: Check Armor
        // If full armor, maybe we can tank a bit more? 
        // For now, respect the threshold absolutely as a safety mechanism.

        if (this.bot.health < threshold) {
            console.log(`[Reflex] 💔 Critical Health (<${threshold})! Running away...`);
            this.active = true;
            this.agent.requestInterrupt();

            // Context Awareness: Don't run into lava
            // moveAway now should ideally use a safer pathfinding or simple vector check
            // For now, we rely on skills.moveAway but we should visually check destination safety in future (Phase 6)
            await skills.moveAway(this.bot, panicDist);
            this.active = false;
        }
    }
}

