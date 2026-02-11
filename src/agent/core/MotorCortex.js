import { createNoise2D } from 'simplex-noise';

/**
 * MotorCortex.js
 * 
 * Neuromorphic Motor Control module for human-like movement.
 * Uses Cubic Bézier Curves for natural trajectories and Perlin noise for idle jitter.
 * Implements Fitts's Law to simulate deceleration when approaching a target.
 */
export class MotorCortex {
    constructor(bot) {
        this.bot = bot;
        this.noise2D = createNoise2D();
        this.noiseTime = 0;
        this.targetLook = null;
        this.lookQueue = [];
        this.isProcessing = false;
    }

    /**
     * Generates a random control point for Bézier interpolation.
     * @param {Object} start {yaw, pitch}
     * @param {Object} end {yaw, pitch}
     * @returns {Object} {yaw, pitch}
     */
    _getControlPoint(start, end) {
        const dist = Math.sqrt((end.yaw - start.yaw) ** 2 + (end.pitch - start.pitch) ** 2);
        const offset = dist * 0.3 * (Math.random() - 0.5); // Customizable curvature
        return {
            yaw: (start.yaw + end.yaw) / 2 + offset,
            pitch: (start.pitch + end.pitch) / 2 + offset
        };
    }

    /**
     * Cubic Bézier Interpolation formula.
     * B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
     */
    _cubicBezier(t, p0, p1, p2, p3) {
        return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
    }

    /**
     * Smoothly rotates the bot's head to look at a target position.
     * @param {Vec3} targetPos The position to look at.
     * @param {Number} urgency Speed factor (higher = faster). PvP: 1.0-1.5, Building: 0.5-0.8.
     */
    async humanLook(targetPos, urgency = 1.0) {
        if (!this.bot.entity) return;

        return new Promise(resolve => {
            this.lookQueue.push({ targetPos, urgency, resolve });
            if (!this.isProcessing) this._processLookQueue();
        });
    }

    async _processLookQueue() {
        if (this.lookQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { targetPos, urgency, resolve } = this.lookQueue.shift();

        const startYaw = this.bot.entity.yaw;
        const startPitch = this.bot.entity.pitch;

        // Calculate target angles
        const eyePos = this.bot.entity.position.offset(0, 1.62, 0);
        const delta = targetPos.minus(eyePos);
        const targetYaw = Math.atan2(-delta.x, -delta.z);
        const targetPitch = Math.asin(-delta.y / delta.norm());

        const duration = (Math.random() * 50 + 150) / urgency; // 150-200ms
        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let t = elapsed / duration;

            if (t >= 1) {
                this.bot.look(targetYaw, targetPitch, true);
                clearInterval(interval);
                resolve();
                this._processLookQueue();
                return;
            }

            // Easing: Slow-Fast-Slow (Quadratic)
            const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Micro-jitter Simulation (Hand Tremor)
            const jitter = (Math.random() - 0.5) * 0.02 * (1 - easeT);

            const currentYaw = startYaw + (targetYaw - startYaw) * easeT + jitter;
            const currentPitch = startPitch + (targetPitch - startPitch) * easeT + jitter;

            // Force packet update
            this.bot.look(currentYaw, currentPitch, true);
        }, 10); // High-fidelity interpolation (10ms)
    }
}

export default MotorCortex;
