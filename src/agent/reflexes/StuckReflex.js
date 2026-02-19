import { globalBus, SIGNAL } from '../core/SignalBus.js';
import Vec3 from 'vec3';

/**
 * StuckReflex - Chapter II: Block Breaking Parity
 * 
 * Automatically detects and clears obstructions when the agent is stuck.
 * Triggered by Physical Watchdog or manual navigation failure.
 */
export class StuckReflex {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.isRecovering = false;
        this._maxRetries = 3;
    }

    async recover() {
        if (this.isRecovering) return;
        this.isRecovering = true;
        this.bot = this.agent.bot;

        console.log('[StuckReflex] ⛏️ Initiating Emergency Block Breaking...');

        try {
            // 1. Panic Stop
            if (this.agent.motor) {
                this.agent.motor.panicStop();
            } else {
                this.bot.clearControlStates();
            }

            // 2. Scan for obstructions (Heads/Feet level)
            const headPos = this.bot.entity.position.offset(0, 1, 0);
            const footPos = this.bot.entity.position.clone();

            // Checks blocks in movement direction or immediate proximity
            const obstructions = this._findObstructingBlocks();

            if (obstructions.length === 0) {
                console.log('[StuckReflex] No obvious block obstructions. Trying jump-burst...');
                await this._physicalBurst();
            } else {
                for (const block of obstructions) {
                    await this._clearBlock(block);
                }
            }

            // 3. Post-recovery jump
            if (this.agent.motor) {
                this.agent.motor.jumpSync();
            }

        } catch (err) {
            console.error('[StuckReflex] Recovery failed:', err.message);
        } finally {
            this.isRecovering = false;
        }
    }

    _findObstructingBlocks() {
        const bot = this.bot;
        const pos = bot.entity.position.floored();
        const dir = new Vec3(-Math.sin(bot.entity.yaw), 0, -Math.cos(bot.entity.yaw));

        const scanOffsets = [
            dir.clone().floored(), // Front
            dir.clone().offset(0, 1, 0).floored(), // Front-Head
            new Vec3(0, 2, 0) // Overhead (if jumping)
        ];

        const obstructions = [];
        for (const offset of scanOffsets) {
            const block = bot.blockAt(pos.plus(offset));
            if (block && block.boundingBox !== 'empty' && block.name !== 'air') {
                // Ignore unbreakable/very hard blocks in reflex mode?
                if (block.digTime(null) < 5000) { // < 5s digging
                    obstructions.push(block);
                }
            }
        }
        return obstructions;
    }

    async _clearBlock(block) {
        console.log(`[StuckReflex] Clearing ${block.name} at ${block.position}`);
        try {
            // Equipping appropriate tool if registry exists
            if (this.agent.toolRegistry) {
                // ToolRegistry might have a helper for this
                // await this.agent.toolRegistry.equipToolForBlock(block);
            }

            await this.bot.dig(block);
        } catch (err) {
            console.warn(`[StuckReflex] Failed to dig ${block.name}:`, err.message);
        }
    }

    async _physicalBurst() {
        // Simple random movement burst to jitter out of a stuck state
        const controls = ['jump', 'forward', 'back', 'left', 'right'];
        const randomCtrl = controls[Math.floor(Math.random() * controls.length)];

        this.bot.setControlState(randomCtrl, true);
        await new Promise(r => setTimeout(r, 200));
        this.bot.setControlState(randomCtrl, false);
    }
}

export default StuckReflex;
