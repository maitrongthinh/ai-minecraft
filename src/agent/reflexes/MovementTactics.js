/**
 * MovementTactics.js - Pro Player Movement Patterns
 * 
 * Phase 3: Gladiator Update
 * 
 * Handles: strafing, critical hits, shield parry, pillar up, pearl out.
 */

export class MovementTactics {
    constructor(agent) {
        this.agent = agent;

        // Strafe state
        this.strafeAngle = 0;
        this.strafeDirection = 1; // 1 = clockwise, -1 = counter-clockwise
    }

    /**
     * Circle strafe around target
     * @param {Entity} target - Target to circle
     * @param {number} radius - Desired distance
     */
    async strafe(target, radius = 2.5) {
        if (!target?.position || !this.agent.bot?.entity?.position) return;

        const botPos = this.agent.bot.entity.position;
        const targetPos = target.position;

        // Calculate angle from target to bot
        const dx = botPos.x - targetPos.x;
        const dz = botPos.z - targetPos.z;
        const currentAngle = Math.atan2(dz, dx);

        // Increment angle for strafing
        this.strafeAngle += 0.15 * this.strafeDirection; // ~8.5° per tick

        // Randomly change direction to be unpredictable
        if (Math.random() < 0.02) {
            this.strafeDirection *= -1;
        }

        // Calculate new position
        const newAngle = currentAngle + this.strafeAngle;
        const newX = targetPos.x + Math.cos(newAngle) * radius;
        const newZ = targetPos.z + Math.sin(newAngle) * radius;

        // Look at target while moving
        await this.agent.bot.lookAt(targetPos.offset(0, 1.6, 0));

        // PRIORITY: Flocking (Phase 4)
        const flockingVec = this.agent.bot.agent?.swarm ? await this.agent.bot.agent.swarm.getFlockingVector() : { x: 0, y: 0, z: 0 };

        // Move toward new position + flocking bias
        const goalPos = {
            x: newX + (flockingVec.x || 0),
            y: botPos.y,
            z: newZ + (flockingVec.z || 0)
        };
        this._moveToward(goalPos);
    }

    /**
     * Approach target (close gap)
     */
    async approach(target) {
        if (!target?.position) return;

        await this.agent.bot.lookAt(target.position.offset(0, 1.6, 0));
        this.agent.bot.setControlState('forward', true);
        this.agent.bot.setControlState('sprint', true);

        await new Promise(r => setTimeout(r, 100));

        this.agent.bot.setControlState('forward', false);
        this.agent.bot.setControlState('sprint', false);
    }

    /**
     * Run away from target
     */
    async runAway(target, distance = 20) {
        if (!target?.position || !this.agent.bot?.entity?.position) return;

        // Calculate direction away from target
        const botPos = this.agent.bot.entity.position;
        const targetPos = target.position;

        const dx = botPos.x - targetPos.x;
        const dz = botPos.z - targetPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Normalize and scale
        const goalX = botPos.x + (dx / dist) * distance;
        const goalZ = botPos.z + (dz / dist) * distance;

        // Look away and run
        await this.agent.bot.lookAt({ x: goalX, y: botPos.y, z: goalZ });

        this.agent.bot.setControlState('forward', true);
        this.agent.bot.setControlState('sprint', true);

        // Run for 3 seconds
        await new Promise(r => setTimeout(r, 3000));

        this.agent.bot.setControlState('forward', false);
        this.agent.bot.setControlState('sprint', false);
    }

    /**
     * Pillar up to escape ground enemies
     * @param {number} height - Blocks to pillar up
     */
    async pillarUp(height = 5) {
        const block = this._getPlaceableBlock();
        if (!block) {
            console.warn('[MovementTactics] No blocks for pillar up');
            return false;
        }

        console.log(`[MovementTactics] 🧱 Pillar up ${height} blocks`);

        try {
            for (let i = 0; i < height; i++) {
                // Look down
                await this.agent.bot.look(0, Math.PI / 2); // Pitch down

                // Jump and place
                this.agent.bot.setControlState('jump', true);
                await new Promise(r => setTimeout(r, 150));

                // Place block under feet
                const blockBelow = this.agent.bot.blockAt(
                    this.agent.bot.entity.position.offset(0, -1, 0)
                );

                if (blockBelow && block.count > 0) {
                    await this.agent.bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 });
                }

                this.agent.bot.setControlState('jump', false);
                await new Promise(r => setTimeout(r, 100));
            }

            return true;
        } catch (e) {
            console.error('[MovementTactics] Pillar failed:', e.message);
            return false;
        }
    }

    /**
     * Use ender pearl to escape
     * @param {Vec3} safePos - Position to pearl toward
     */
    async pearlOut(safePos) {
        const pearl = this.agent.bot.inventory.items().find(i => i.name === 'ender_pearl');
        if (!pearl) return false;

        console.log('[MovementTactics] 🟣 Pearl out!');

        try {
            await this.agent.bot.equip(pearl, 'hand');

            // Calculate throw angle
            if (safePos) {
                await this.agent.bot.lookAt(safePos);
            } else {
                // Just look forward and up slightly
                await this.agent.bot.look(this.agent.bot.entity.yaw, -0.3);
            }

            // Throw pearl
            this.agent.bot.activateItem();
            await new Promise(r => setTimeout(r, 100));

            return true;
        } catch (e) {
            console.error('[MovementTactics] Pearl failed:', e.message);
            return false;
        }
    }

    /**
     * Tunnel into wall to hide and heal
     * @param {number} depth - Blocks to dig
     */
    async tunnelEscape(depth = 3) {
        console.log(`[MovementTactics] ⛏️ Tunnel escape ${depth} blocks`);

        try {
            // Look straight ahead at eye level
            const yaw = this.agent.bot.entity.yaw;
            await this.agent.bot.look(yaw, 0);

            // Dig forward
            for (let i = 0; i < depth; i++) {
                const targetPos = this.agent.bot.entity.position.offset(
                    Math.sin(yaw) * (i + 1),
                    0,
                    Math.cos(yaw) * (i + 1)
                );

                const block = this.agent.bot.blockAt(targetPos);
                if (block && block.name !== 'air' && block.diggable) {
                    await this.agent.bot.dig(block);
                }

                // Move forward
                this.agent.bot.setControlState('forward', true);
                await new Promise(r => setTimeout(r, 300));
                this.agent.bot.setControlState('forward', false);
            }

            // Place block behind to seal tunnel
            const sealBlock = this._getPlaceableBlock();
            if (sealBlock) {
                const behind = this.agent.bot.entity.position.offset(
                    -Math.sin(yaw) * 1,
                    0,
                    -Math.cos(yaw) * 1
                );
                const refBlock = this.agent.bot.blockAt(behind);
                if (refBlock) {
                    await this.agent.bot.equip(sealBlock, 'hand');
                    await this.agent.bot.placeBlock(refBlock, { x: 0, y: 0, z: 0 });
                }
            }

            return true;
        } catch (e) {
            console.error('[MovementTactics] Tunnel failed:', e.message);
            return false;
        }
    }

    /**
     * Get placeable block from inventory (dirt, cobblestone, etc.)
     */
    _getPlaceableBlock() {
        const items = this.agent.bot.inventory.items();

        // Prefer cheap blocks
        const preferredBlocks = [
            'cobblestone', 'dirt', 'netherrack', 'stone',
            'cobbled_deepslate', 'end_stone'
        ];

        for (const blockName of preferredBlocks) {
            const block = items.find(i => i.name === blockName);
            if (block) return block;
        }

        // Fallback: any solid block
        return items.find(i =>
            i.name.includes('stone') ||
            i.name.includes('dirt') ||
            i.name.includes('planks')
        );
    }

    /**
     * Move toward a position using control states
     */
    _moveToward(goalPos) {
        const botPos = this.agent.bot.entity.position;
        const dx = goalPos.x - botPos.x;
        const dz = goalPos.z - botPos.z;

        // Calculate required yaw
        const yaw = Math.atan2(-dx, -dz);

        // Set controls based on direction (simplified)
        this.agent.bot.setControlState('forward', true);
        this.agent.bot.entity.yaw = yaw;

        // Clear after short duration
        setTimeout(() => {
            this.agent.bot.setControlState('forward', false);
        }, 50);
    }
}

export default MovementTactics;
