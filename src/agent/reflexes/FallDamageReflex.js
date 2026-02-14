
import { SIGNAL, globalBus } from '../core/SignalBus.js';

export class FallDamageReflex {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.active = false;
        this.unsubscribe = null;
    }

    start() {
        if (this.active) return;
        this.active = true;

        // Listen for cliff hazards detected by EnvironmentMonitor
        this.unsubscribe = globalBus.subscribe(SIGNAL.ENV_CLIFF_AHEAD, this.handleCliff.bind(this));

        // Listen for lava hazards (avoidance)
        this.unsubscribeLava = globalBus.subscribe(SIGNAL.ENV_LAVA_NEARBY, this.handleLava.bind(this));

        // Start monitoring fall velocity for MLG bucket attempts
        this._startFallMonitor();

        console.log('[FallDamageReflex] Active (cliff/lava detection + MLG bucket).');
    }

    stop() {
        this.active = false;
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.unsubscribeLava) {
            this.unsubscribeLava();
            this.unsubscribeLava = null;
        }
        this._stopFallMonitor();
    }

    async handleLava(event) {
        if (!this.active || !this.bot) return;
        const { distance, position } = event.payload;

        if (distance <= 2) {
            console.log(`[FallDamageReflex] 🔥 LAVA AHEAD (Dist: ${distance}). Stopping!`);
            this.bot.clearControlStates();
            this.bot.setControlState('back', true);
            this.bot.setControlState('sneak', true);

            setTimeout(() => {
                if (this.bot) {
                    this.bot.setControlState('back', false);
                    this.bot.setControlState('sneak', false);
                }
            }, 800);
        }
    }

    async handleCliff(event) {
        if (!this.active || !this.bot) return;

        const { distance, depth, position } = event.payload;

        // Immediate Reaction: STOP if very close to edge
        if (distance <= 2) {
            console.log(`[FallDamageReflex] 🛑 CLIFF (Dist: ${distance}, Depth: ${depth}). Stopping!`);

            // 1. Halt Movement
            this.bot.clearControlStates();

            // 2. Backpedal + sneak to avoid falling
            this.bot.setControlState('back', true);
            this.bot.setControlState('sprint', false);
            this.bot.setControlState('jump', false);
            this.bot.setControlState('sneak', true);

            // Release after safety duration
            setTimeout(() => {
                if (this.bot) {
                    this.bot.setControlState('back', false);
                    this.bot.setControlState('sneak', false);
                }
            }, 1000);

            // Emit threat event for other systems
            globalBus.emitSignal(SIGNAL.THREAT_DETECTED, {
                type: 'environmental_hazard',
                source: 'cliff',
                severity: depth > 10 ? 'critical' : 'medium'
            });
        }
    }

    /**
     * Attempt MLG water bucket when already falling.
     * Called when the bot detects it's falling from a dangerous height.
     */
    async attemptMLGBucket() {
        if (!this.bot) return false;

        const vel = this.bot.entity?.velocity;
        if (!vel || vel.y >= -0.5) return false; // Not actually falling fast

        // Check if we have a water bucket
        const waterBucket = this.bot.inventory.items().find(
            i => i.name === 'water_bucket'
        );

        if (!waterBucket) {
            console.log('[FallDamageReflex] No water bucket for MLG!');
            return false;
        }

        try {
            console.log('[FallDamageReflex] 🪣 Attempting MLG water bucket!');

            // 1. Equip water bucket
            await this.bot.equip(waterBucket, 'hand');

            // 2. Look straight down
            await this.bot.look(0, -Math.PI / 2, true);

            // 3. Activate (place water) — timing depends on height
            // We use the item when close to ground
            this.bot.activateItem();

            // 4. Wait briefly then pick up water again
            setTimeout(async () => {
                try {
                    if (!this.bot) return;
                    // Try to pick up the water source by right-clicking with bucket
                    const emptyBucket = this.bot.inventory.items().find(
                        i => i.name === 'bucket'
                    );
                    if (emptyBucket) {
                        await this.bot.equip(emptyBucket, 'hand');
                        this.bot.activateItem();
                    }
                } catch (e) {
                    // Non-critical, water stays placed
                }
            }, 1500);

            return true;
        } catch (err) {
            console.error('[FallDamageReflex] MLG failed:', err.message);
            return false;
        }
    }

    /**
     * Start monitoring falling velocity for MLG attempts
     */
    _startFallMonitor() {
        if (this._fallMonitor) return;

        this._fallMonitor = setInterval(() => {
            if (!this.active || !this.bot?.entity) return;

            const vel = this.bot.entity.velocity;
            if (vel && vel.y < -0.8) {
                // Falling fast — try MLG
                this.attemptMLGBucket();
            }
        }, 200); // Check every 200ms
    }

    _stopFallMonitor() {
        if (this._fallMonitor) {
            clearInterval(this._fallMonitor);
            this._fallMonitor = null;
        }
    }
}
