/**
 * Watchdog.js
 * 
 * Anti-Stuck Mechanism:
 * Monitors bot state (Position, Health, Inventory) periodically.
 * If no change for timeout period, triggers Emergency Protocol.
 * 
 * Config in settings.js:
 *   watchdog.enabled: true/false
 *   watchdog.stuck_timeout_seconds: seconds before emergency
 *   watchdog.check_interval_ms: polling interval
 */

import settings from '../../../settings.js';

export class Watchdog {
    constructor(agent) {
        this.agent = agent;

        // Read Config from settings.js (Gap 3 Fix)
        const watchdogConfig = settings.watchdog || {};
        this.enabled = watchdogConfig.enabled !== false; // Default true
        this.CHECK_INTERVAL = watchdogConfig.check_interval_ms || 3000;
        this.STUCK_TIMEOUT = (watchdogConfig.stuck_timeout_seconds || 180) * 1000;

        // State
        this.lastPosition = null;
        this.lastActionTime = Date.now();
        this.timer = null;

        console.log(`[Watchdog] Config: enabled=${this.enabled}, timeout=${this.STUCK_TIMEOUT / 1000}s, interval=${this.CHECK_INTERVAL}ms`);
    }

    start() {
        if (!this.enabled) {
            console.log('[Watchdog] Disabled in settings. Not starting.');
            return;
        }
        if (this.timer) clearInterval(this.timer);
        const profile = this.agent.config?.profile;
        this.CHECK_INTERVAL = profile?.timeouts?.recovery_interval || settings.watchdog?.check_interval_ms || 3000;
        this.timer = setInterval(() => this.check(), this.CHECK_INTERVAL);
        console.log('[Watchdog] Started monitoring.');
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    check() {
        if (!this.enabled || !this.agent.bot || !this.agent.bot.entity) {
            if (this.timer && !this.agent.running) {
                console.log('[Watchdog] Bot deactivated, auto-stopping timer.');
                this.stop();
            }
            return;
        }

        // BRAIN REFACTOR Phase D: Respect agent flags (Reflex Guard)
        // Don't interrupt during precision work or when reflexes disabled
        if (this.agent.flags) {
            if (this.agent.flags.critical_action) {
                // Agent is doing precision work, don't interfere
                this.lastActionTime = Date.now(); // Reset timer
                return;
            }
            if (!this.agent.flags.allow_reflex) {
                // Reflexes globally disabled
                return;
            }
        }

        const currentPos = this.agent.bot.entity.position;

        // Initialize if first run
        if (!this.lastPosition) {
            this.lastPosition = currentPos.clone();
            this.lastActionTime = Date.now();
            return;
        }

        // Check distance moved
        const dist = currentPos.distanceTo(this.lastPosition);

        // If moved significantly (> 1 block)
        if (dist > 1.0) {
            this.lastActionTime = Date.now();
            this.lastPosition = currentPos.clone();
            return;
        }

        // If IDLE state, we don't care if we don't move
        if (this.agent.isIdle && this.agent.isIdle()) {
            this.lastActionTime = Date.now(); // Reset timer
            return;
        }

        // If Doing a task but stuck
        if (Date.now() - this.lastActionTime > this.STUCK_TIMEOUT) {
            this.triggerEmergency();
        }
    }

    async triggerEmergency() {
        console.warn(`[Watchdog] 🚨 AGENT STUCK for ${this.STUCK_TIMEOUT / 1000}s! Triggering Emergency Protocol.`);
        this.lastActionTime = Date.now(); // Reset to prevent spam loop

        // Gap 2 Fix: Log stuck event to Cognee for learning
        if (this.agent.cogneeMemory && this.agent.world_id) {
            const pos = this.agent.bot?.entity?.position;
            const posStr = pos ? `(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)})` : 'unknown';
            this.agent.cogneeMemory.storeExperience(
                this.agent.world_id,
                [`Bot got stuck at position ${posStr} for ${this.STUCK_TIMEOUT / 1000} seconds. Emergency protocol triggered.`],
                { type: 'stuck', position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null }
            ).catch(err => console.warn('[Watchdog] Failed to log stuck event to Cognee:', err.message));
        }

        // BRAIN REFACTOR Phase D: Log to history.addError for failure-aware planning
        if (this.agent.history) {
            const pos = this.agent.bot?.entity?.position;
            const posStr = pos ? `(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)})` : 'unknown';
            const currentState = this.agent.stateStack ? this.agent.stateStack.current() : 'unknown';
            this.agent.history.addError(
                'got_stuck',
                `Stuck at ${posStr} during ${currentState} state for ${this.STUCK_TIMEOUT / 1000}s`
            );
        }

        // Level 1: Try Jumping
        try {
            this.agent.bot.setControlState('jump', true);
            await new Promise(r => setTimeout(r, 500));
            this.agent.bot.setControlState('jump', false);

            // Level 2: Try random walk
            const randomX = (Math.random() - 0.5) * 10;
            const randomZ = (Math.random() - 0.5) * 10;
            const goal = this.agent.bot.entity.position.offset(randomX, 0, randomZ);

            // Override current action
            if (this.agent.bot.pathfinder) {
                this.agent.bot.pathfinder.setGoal(null);
            }

            await this.agent.bot.lookAt(goal);
            this.agent.bot.setControlState('forward', true);
            await new Promise(r => setTimeout(r, 1000));
            this.agent.bot.setControlState('forward', false);

            console.log('[Watchdog] Emergency maneuvers executed.');
        } catch (err) {
            console.error('[Watchdog] Failed to execute emergency maneuvers:', err);
        }
    }
}
