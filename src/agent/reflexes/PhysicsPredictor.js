/**
 * PhysicsPredictor.js
 * 
 * Handles physics calculations for the bot, such as falling velocity, 
 * trajectory prediction, and MLG (Waterdrop) timing.
 */
export class PhysicsPredictor {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Predicts the tick when the bot will hit the ground.
     * @returns {Number|null} Estimated ticks until impact, or null if not falling.
     */
    getTicksUntilImpact() {
        if (this.bot.entity.onGround) return null;
        if (this.bot.entity.velocity.y >= 0) return null; // Not falling down

        let pos = this.bot.entity.position.clone();
        let velY = this.bot.entity.velocity.y;
        let ticks = 0;

        // Simple physics simulation loop (Minecraft constants)
        const gravity = 0.08;
        const drag = 0.98;

        while (ticks < 100) { // Max 5 seconds prediction
            ticks++;
            velY = (velY - gravity) * drag;
            pos.y += velY;

            const block = this.bot.blockAt(pos);
            if (block && block.boundingBox !== 'empty') {
                return ticks;
            }
        }
        return null;
    }

    /**
     * Checks if the bot needs to perform an MLG Waterdrop.
     * @returns {Boolean}
     */
    shouldMLG() {
        const ticks = this.getTicksUntilImpact();
        if (ticks !== null && ticks <= 3) { // 3 ticks before impact (~150ms)
            return true;
        }
        return false;
    }

    /**
     * Performs a predictive MLG attempt with high-precision flick.
     */
    async performMLG() {
        const waterBucket = this.bot.inventory.findInventoryItem('water_bucket', null);
        if (!waterBucket) return { success: false, reason: 'No water bucket' };

        try {
            await this.bot.equip(waterBucket, 'hand');

            // 1. Grid-Center Alignment (Flick pitch to -90)
            // Looking straight down maximizes the server's acceptance of block placement.
            await this.bot.look(this.bot.entity.yaw, -Math.PI / 2, true);

            // 2. Predictive placement: Use activateItem (lower latency than activateBlock)
            this.bot.activateItem();

            // 3. Auto-retract: Wait 1 tick (50ms) and scoop up water to avoid flow disruption
            setTimeout(() => {
                if (this.bot.entity) this.bot.activateItem();
            }, 100);

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Calculates the estimated fall height in blocks.
     * @returns {number} blocks
     */
    getFallHeight() {
        if (this.bot.entity.onGround) return 0;

        let pos = this.bot.entity.position.clone();
        let y = pos.y;

        // Cast a ray down
        for (let i = 1; i <= 50; i++) {
            const block = this.bot.blockAt(pos.offset(0, -i, 0));
            if (block && block.boundingBox !== 'empty') {
                return i - 1 + (y - Math.floor(y)); // Accurate distance
            }
        }
        return 50; // > 50 blocks
    }

    /**
     * Predicts where the bot will land based on current velocity.
     * @returns {Vec3|null}
     */
    predictLandingPosition() {
        if (this.bot.entity.onGround) return this.bot.entity.position.clone();

        let pos = this.bot.entity.position.clone();
        let vel = this.bot.entity.velocity.clone();
        const gravity = 0.08;
        const drag = 0.98;

        for (let ticks = 0; ticks < 60; ticks++) { // 3 seconds max
            vel.y = (vel.y - gravity) * drag;
            pos.add(vel);

            const block = this.bot.blockAt(pos.floored());
            if (block && block.boundingBox !== 'empty') {
                return pos.floored();
            }
        }
        return null;
    }

    /**
     * Calculates potential fall damage from a given height.
     * Damage = ceil(distance - 3)
     * @param {Number} distance 
     * @returns {Number} damage (hearts * 2) - actually it returns health points
     */
    calculateFallDamage(distance) {
        if (distance <= 3) return 0;
        return Math.ceil(distance - 3);
    }

    /**
     * Predicts potential fall damage if the bot walks off the current edge.
     * @returns {Object} { damage, risk }
     */
    predictFallRisk() {
        const height = this.getFallHeight();
        if (height > 3) {
            const damage = this.calculateFallDamage(height);
            return {
                damage,
                risk: damage >= 20 ? 'fatal' : (damage > 5 ? 'high' : 'medium'),
                height
            };
        }
        return { damage: 0, risk: 'none', height };
    }

}

export default PhysicsPredictor;
