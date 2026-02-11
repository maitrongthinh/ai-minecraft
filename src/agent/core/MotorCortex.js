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

        const start = { yaw: this.bot.entity.yaw, pitch: this.bot.entity.pitch };

        // Capture target angles
        const originalYaw = this.bot.entity.yaw;
        const originalPitch = this.bot.entity.pitch;
        await this.bot.lookAt(targetPos, true);
        const end = { yaw: this.bot.entity.yaw, pitch: this.bot.entity.pitch };

        this.bot.entity.yaw = originalYaw;
        this.bot.entity.pitch = originalPitch;

        const cp1 = this._getControlPoint(start, end);
        const cp2 = this._getControlPoint(start, end);

        const duration = (Math.random() * 150 + 200) / urgency;
        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let t = elapsed / duration;

            if (t >= 1) {
                this.bot.look(end.yaw, end.pitch);
                clearInterval(interval);
                resolve();
                this._processLookQueue();
                return;
            }

            const tEase = 1 - Math.pow(1 - t, 3);
            const currentYaw = this._cubicBezier(tEase, start.yaw, cp1.yaw, cp2.yaw, end.yaw);
            const currentPitch = this._cubicBezier(tEase, start.pitch, cp1.pitch, cp2.pitch, end.pitch);

            this.noiseTime += 0.05;
            const noiseX = this.noise2D(this.noiseTime, 0) * 0.008;
            const noiseY = this.noise2D(0, this.noiseTime) * 0.008;

            this.bot.look(currentYaw + noiseX, currentPitch + noiseY);
        }, 10);
    }
}

export default MotorCortex;
