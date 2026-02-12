/**
 * CombatReflex.js - The Gladiator's Instinct
 * 
 * High-performance combat reflexes handling packet manipulation and tick-perfect timing.
 * Implements W-Tap (knockback optimization), Auto-Totem, and tactical engagement.
 * 
 * State Machine: IDLE → ENGAGE → RETREAT
 */

import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { PRIORITY } from '../core/TaskScheduler.js';
import { MovementTactics } from './MovementTactics.js';
import { CombatUtils } from '../../utils/CombatUtils.js';

// Combat States
const STATE = {
    IDLE: 'IDLE',
    ENGAGE: 'ENGAGE',
    RETREAT: 'RETREAT'
};

export class CombatReflex {
    constructor(agent) {
        this.agent = agent;
        this.tactics = new MovementTactics(agent);
        this.wTapActive = true;
        this.autoTotemActive = true;

        // State
        this.state = STATE.IDLE;
        this.target = null;
        this.inCombat = false;
        this._isUpdating = false;
        this.consecutiveFailures = 0; // Circuit Breaker counter
        this.MAX_FAILURES = 3;

        // Tick control
        this.tickInterval = null;
        this.TICK_RATE = 50; // ms (1 game tick)

        // Cooldowns
        this.lastAttackTime = 0;
        this.lastHealTime = 0;
        this.attackCooldown = 600; // ms (sword cooldown ~0.6s)

        // Stats
        this.stats = {
            kills: 0,
            damageDealt: 0,
            retreats: 0
        };

        this._wTapBound = false;
        this._attackListener = null;

        console.log('[CombatReflex] ⚔️ Gladiator initialized');
    }

    _syncBot() {
        const bot = this.agent?.bot || null;
        this.bot = bot;
        this.tactics.bot = bot;
        return bot;
    }

    /**
     * Enter combat mode - activates tick loop
     * @param {Entity} target - The enemy entity
     */
    enterCombat(target) {
        if (!this._syncBot()) return;
        if (this.inCombat && this.target === target) return;

        this.target = target;
        this.state = STATE.ENGAGE;
        this.inCombat = true;

        // Signal MindOS (Phase 4.5)
        globalBus.emitSignal(SIGNAL.COMBAT_STARTED, { target: target.name || target.username });

        // Phase 2: W-Tap initialization
        this._setupWTap();

        // Schedule as Priority 100 (SURVIVAL)
        if (this.agent.scheduler) {
            this.agent.scheduler.schedule(
                'combat_reflex',
                PRIORITY.SURVIVAL,
                async () => this._combatLoop(),
                false // Cannot run parallel - needs full control
            );
        } else {
            // Fallback: start tick loop directly
            this._startTickLoop();
        }

        console.log(`[CombatReflex] ⚔️ COMBAT ENGAGED: ${target?.name || 'unknown'}`);
    }

    /**
     * W-Tap: Resets sprinting after hitting a target to maximize knockback.
     * Uses Gaussian distribution (mean=70ms, stdDev=15ms) to mimic human jitter.
     */
    _setupWTap() {
        if (!this.bot || this._wTapBound) return;

        // Gaussian Random Generator (Box-Muller)
        const gaussianRandom = (mean, stdDev) => {
            const u = 1 - Math.random();
            const v = Math.random();
            const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stdDev + mean;
        };

        this._attackListener = (victim) => {
            if (!this.wTapActive || !this.inCombat) return;

            if (this.bot.controlState.sprint) {
                // Packet-Level Reset: stop -> wait -> start
                this.bot.setControlState('sprint', false);

                // Adaptive jitter: 70ms mean, 15ms stdDev
                const delay = Math.max(40, Math.min(120, gaussianRandom(70, 15)));

                setTimeout(() => {
                    if (this.bot.entity && this.inCombat) {
                        this.bot.setControlState('sprint', true);
                    }
                }, delay);
            }
        };

        this.bot.on('entityAttack', (attacker, victim) => {
            if (attacker === this.bot.entity) {
                if (this._attackListener) this._attackListener(victim);
            }
        });
        this._wTapBound = true;
    }

    /**
     * Exit combat mode
     */
    exitCombat() {
        const bot = this._syncBot();
        this.state = STATE.IDLE;
        this.target = null;
        this.inCombat = false;
        this._stopTickLoop();

        // Signal MindOS
        globalBus.emitSignal(SIGNAL.COMBAT_ENDED, { reason: 'manual_exit' });

        // Remove W-Tap listener
        if (this._wTapBound && this.bot && this._attackListener) {
            this.bot.removeListener('entityAttack', this._attackListener);
        }
        this._wTapBound = false;
        this._attackListener = null;

        // Clear control states
        if (bot) bot.clearControlStates();
        this.consecutiveFailures = 0; // Reset circuit breaker

        console.log('[CombatReflex] 🛡️ Combat ended');

        // Phase 2: Genetic Learning - Record result
        if (this.agent.evolution) {
            // If we retreated or HP is low, consider it a "loss" or "draw" for optimization
            const result = (bot && bot.health > 10 && !this._shouldRetreat());
            this.agent.evolution.recordCombatResult(result);
        }
    }

    /**
     * Main combat loop (runs via TaskScheduler)
     */
    async _combatLoop() {
        this._startTickLoop();

        // Wait while in combat
        while (this.inCombat) {
            await new Promise(r => setTimeout(r, 100));

            // Check if target is dead or gone
            if (!this._isValidTarget(this.target)) {
                this.exitCombat();
                break;
            }
        }
    }

    /**
     * Start the 50ms tick loop
     */
    _startTickLoop() {
        if (this.tickInterval) return;

        this.tickInterval = setInterval(() => {
            // Deadman Switch: Lag Protection (Senior Architect Requirement)
            const ping = this.bot.player?.ping || 50;
            if (ping > 500) {
                console.warn(`[CombatReflex] ⚠️ LAG DETECTED (${ping}ms). Engaging Deadman Switch.`);
                this.bot.clearControlStates();

                // Panic Survival: Eat/Gapple/Totem
                const gapple = this.bot.inventory.findInventoryItem('golden_apple', null);
                if (gapple) {
                    this.bot.equip(gapple, 'hand').then(() => this.bot.activateItem());
                }
                return; // Suppress combat packets during lag
            }

            this.tick().then(() => {
                this.consecutiveFailures = 0; // Reset on success
            }).catch(e => {
                console.error('[CombatReflex] Tick error:', e.message);
                this.consecutiveFailures++;

                if (this.consecutiveFailures >= this.MAX_FAILURES) {
                    console.error(`[CombatReflex] 💀 CIRCUIT BREAKER TRIGGERED (${this.consecutiveFailures} failures). Terminating combat loop.`);
                    this.exitCombat();

                    // Signal MindOS Specialists
                    globalBus.emitSignal(SIGNAL.SYSTEM_ERROR, {
                        source: 'CombatReflex',
                        error: 'Multiple combat tick failures. Possible network disconnect.'
                    });

                    // Trigger Strategic Recall
                    globalBus.emitSignal(SIGNAL.EMERGENCY_RECALL, {
                        reason: 'network_failure',
                        consecutiveFailures: this.consecutiveFailures
                    });
                }
            });
        }, this.TICK_RATE);
    }

    /**
     * Predictive Crystal Aura: Network-Level Burst.
     * Bypasses standard event loop and bot.attack() for tick-perfect timing.
     */
    async _executeCrystalAura(targetBlockPos) {
        if (!this.target) return;
        const bot = this.bot;

        // 1. Gửi lệnh đặt Crystal lên khối Obsidian
        bot.activateBlock(bot.blockAt(targetBlockPos));

        // 2. Transient Listener: Bắt gói tin sinh ra thực thể (spawn_entity)
        const onEntitySpawn = (packet, meta) => {
            // Type 51 (~ bản cũ) hoặc ObjectData cho End Crystal
            if (meta.name === 'spawn_entity' && (packet.type === 51 || packet.objectData === 51)) {
                const dx = Math.abs(packet.x - targetBlockPos.x);
                const dy = Math.abs(packet.y - targetBlockPos.y);
                const dz = Math.abs(packet.z - targetBlockPos.z);

                // Độ chính xác < 2 block
                if (dx < 2 && dy < 2 && dz < 2) {
                    // Gửi trực tiếp packet 'use_entity' (bypass bot.attack)
                    bot._client.write('use_entity', {
                        target: packet.entityId,
                        mouse: 1 // Left click / Attack
                    });
                    cleanup();
                }
            }
        };

        const cleanup = () => {
            bot._client.removeListener('packet', onEntitySpawn);
            clearTimeout(fallbackTimeout);
        };

        bot._client.on('packet', onEntitySpawn);

        // Fallback: Tự hủy sau 250ms tránh leak bộ nhớ
        const fallbackTimeout = setTimeout(cleanup, 250);
    }

    _calculateExplosionDamage(pos, explosionPos) {
        // Simplified explosion math for Minecraft
        const dist = pos.distanceTo(explosionPos);
        if (dist > 12) return 0;
        const exposure = 1.0; // Assume full exposure for now
        const impactedDist = dist / 12;
        return Math.floor((1.0 - impactedDist) * exposure * 35); // 35 = max crystal damage approx
    }

    /**
     * Stop the tick loop
     */
    _stopTickLoop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    /**
     * Main tick - called every 50ms during combat
     */
    async tick() {
        const bot = this._syncBot();
        if (!bot) return;
        if (!this.inCombat || !this.target || this._isUpdating) return;
        this._isUpdating = true;

        try {
            // PRIORITY 1: Check retreat conditions
            if (this._shouldRetreat()) {
                this.state = STATE.RETREAT;
                await this._executeRetreat();
                return;
            }

            // Phase 2: Auto-Totem (HP < 10)
            if (this.autoTotemActive && bot.health < 10) {
                const totem = bot.inventory.findInventoryItem('totem_of_undying', null);
                if (totem) {
                    const offHand = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
                    if (!offHand || offHand.name !== 'totem_of_undying') {
                        await bot.equip(totem, 'off-hand').catch(() => { });
                    }
                }
            }

            // PRIORITY 2: Emergency healing (HP < 8)
            if (bot.health < 8 && Date.now() - this.lastHealTime > 3000) {
                await this._emergencyHeal();
                return;
            }

            // PRIORITY 3: Combat actions
            if (this.state === STATE.ENGAGE) {
                // Phase 3: Trap Scanning (Adversarial)
                const trapDetected = await this._scanForTraps();
                if (trapDetected) {
                    console.log('[CombatReflex] 🛡️ Trap detected! Shifting position protocol...');
                    await this.tactics.strafe(this.target, 5.0).catch(() => { });
                } else {
                    await this._executeEngagement();
                }
            }
        } finally {
            this._isUpdating = false;
        }
    }

    /**
     * Check if should retreat
     */
    _shouldRetreat() {
        const bot = this._syncBot();
        if (!bot) return true;

        // Critical health (< 3 hearts)
        if (bot.health < 6) return true;

        // No weapon available (Check if inventory is already synced)
        const hasMelee = this._getBestWeapon('melee');
        const hasRange = this._getBestWeapon('range');

        // Wait at least 2 seconds after combat start before retreating for "no weapon"
        // to allow inventory sync (Phase 3 Fix)
        const combatDuration = Date.now() - this.lastAttackTime;
        if (!hasMelee && !hasRange && combatDuration > 2000) {
            return true;
        }

        // Armor almost broken
        const armor = this._getArmorDurability();
        if (armor.lowest < 5 && armor.lowest > 0) return true;

        return false;
    }

    /**
     * Execute retreat protocol
     */
    async _executeRetreat() {
        console.log('[CombatReflex] 🏃 RETREAT TRIGGERED');

        // Signal Critical Health
        if (this.bot.health < 6) {
            globalBus.emitSignal(SIGNAL.HEALTH_CRITICAL, { health: this.bot.health });
        }

        this.stats.retreats++;

        // Priority 1: Pearl out
        if (await this.tactics.pearlOut(this._getSafePosition())) {
            this.exitCombat();
            return;
        }

        // Priority 2: Pillar up
        if (await this.tactics.pillarUp(5)) {
            // Stay on pillar, heal, then exit
            await this._emergencyHeal();
            this.exitCombat();
            return;
        }

        // Priority 3: Run away
        await this.tactics.runAway(this.target, 20);
        this.exitCombat();
    }

    /**
     * Execute combat engagement
     */
    async _executeEngagement() {
        if (!this._syncBot()) return;
        if (!this._isValidTarget(this.target)) {
            this.exitCombat();
            return;
        }

        const distance = this._getDistance(this.target);

        // Equip appropriate weapon
        if (distance <= 4) {
            await this._equipBestWeapon('melee');
        } else if (distance > 8 && this._hasAmmo()) {
            await this._equipBestWeapon('range');
        }

        // Shield management
        if (this._isTargetAttacking()) {
            this.bot.activateItem(); // Raise shield
        } else {
            this.bot.deactivateItem(); // Lower shield
        }

        // PRIORITY: LOS Check
        const hasLOS = this._hasLineOfSight(this.target);
        if (!hasLOS && distance < 10) {
            console.log('[CombatReflex] 🧱 Target obscured by wall. Repositioning...');
            await this.tactics.strafe(this.target, distance); // Reposition
            return;
        }

        // PRIORITY: Terrain Safety
        if (!this._isTerrainSafe()) {
            console.log('[CombatReflex] ⚠️ Dangerous terrain (cliff/void)! Backing up...');
            this.bot.setControlState('back', true);
            setTimeout(() => this.bot.setControlState('back', false), 500);
            return;
        }

        // Movement + Attack
        const latency = this.bot.player.ping || 50;
        const backtrackedPos = this.agent.hitSelector
            ? this.agent.hitSelector.getBacktrackedPosition(this.target, latency)
            : this.target.position;

        if (distance <= 4) {
            // Humanized Look: Aim at backtracked position for high-precision (Anti-Cheat Bypass)
            await this.agent.actionAPI.motorCortex.humanLook(backtrackedPos.offset(0, 0.5, 0), 1.5);

            // Melee range: strafe and crit attack
            await this.tactics.strafe(this.target, 2.5);

            // Phase 4: Swarm Sync - Broadcast target
            globalBus.emitSignal(SIGNAL.ENGAGED_TARGET, {
                targetId: this.target.username || this.target.uuid,
                priority: 1
            });

            // Phase 6: Proactive Crystal Aura (Senior Hardening)
            const hasCrystals = this.bot.inventory.findInventoryItem('end_crystal', null);
            if (hasCrystals) {
                // Determine obsidian block under/near target
                const targetPos = this.target.position;
                const crystalBase = this.bot.findBlock({
                    point: targetPos,
                    matching: (block) => block.name === 'obsidian' || block.name === 'bedrock',
                    maxDistance: 4
                });

                if (crystalBase) {
                    await this._executeCrystalAura(crystalBase.position);
                }
            } else {
                await this._attemptCritAttack();
            }
        } else if (distance <= 8) {
            // Close gap
            await this.tactics.approach(this.target);
        } else {
            // Range attack
            await this._rangedAttack();
        }
    }

    /**
     * Check if bot has Line of Sight to target (no blocks blocking)
     */
    _hasLineOfSight(target) {
        const bot = this._syncBot();
        if (!target) return false;
        if (!bot?.entity?.position || !bot.world?.raycast) return false;

        const eyePos = bot.entity.position.offset(0, 1.6, 0);
        const targetPos = target.position.offset(0, 1.6, 0); // Head height

        const direction = targetPos.minus(eyePos).normalize();
        const dist = eyePos.distanceTo(targetPos);

        // Raycast up to the distance of target
        const block = bot.world.raycast(eyePos, direction, dist);

        // If no block found, or block is transparent/non-solid
        if (!block) return true;

        // Double check if block found is actually "solid"
        return block.boundingBox === 'empty';
    }

    /**
     * Check if the bot is in a safe position (not edge of cliff)
     */
    _isTerrainSafe() {
        const bot = this._syncBot();
        if (!bot?.entity?.position) return false;
        const botPos = bot.entity.position;

        // Check 1 block ahead in moving direction
        const velocity = bot.entity.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
        if (speed < 0.01) return true;

        const direction = velocity.normalize();
        const checkPos = botPos.plus(direction.scaled(1.2));

        // Check block directly underneath
        const blockBelow = bot.blockAt(checkPos.offset(0, -1, 0));
        const blockTwoBelow = bot.blockAt(checkPos.offset(0, -2, 0));

        // Both blocks must be solid enough to avoid stepping into a cliff edge.
        return !!(blockBelow && blockBelow.type !== 0 && blockTwoBelow && blockTwoBelow.type !== 0);
    }

    /**
     * Attempt critical hit (jump + fall + attack)
     */
    async _attemptCritAttack() {
        if (!this._syncBot()) return;
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;

        const velocity = this.bot.entity.velocity;

        // If falling, attack now for crit
        if (velocity.y < -0.1) {
            const latency = this.bot.player.ping || 50;
            const canHit = this.agent.hitSelector
                ? this.agent.hitSelector.canHit(this.target, 3.0, latency)
                : this.bot.entity.position.distanceTo(this.target.position) <= 3.0;

            if (canHit) {
                this.bot.attack(this.target);
                this.lastAttackTime = now;
            }
            return;
        }

        // Otherwise, initiate jump
        if (this.bot.entity.onGround) {
            this.bot.setControlState('jump', true);
            setTimeout(() => this.bot.setControlState('jump', false), 100);
        }
    }

    /**
     * Ranged attack with bow/crossbow
     */
    async _rangedAttack() {
        if (!this._syncBot()) return;
        // Look at target
        await this.bot.lookAt(this.target.position.offset(0, 1.6, 0));

        // Charge and release
        this.bot.activateItem();
        await new Promise(r => setTimeout(r, 800)); // Charge time
        this.bot.deactivateItem();
    }

    /**
     * Emergency heal when HP < 8
     */
    async _emergencyHeal() {
        if (!this._syncBot()) return false;
        const food = this._getBestFood();
        if (!food) {
            console.warn('[CombatReflex] No food available for healing!');
            return false;
        }

        console.log(`[CombatReflex] \ud83c\udf56 Emergency heal with ${food.name}`);

        globalBus.emitSignal(SIGNAL.HEALTH_LOW, { health: this.bot.health, action: 'eating' });

        try {
            await this.bot.equip(food, 'hand');
            this.bot.activateItem();

            // Wait for eating (typically 1.6s)
            await new Promise(r => setTimeout(r, 1800));

            this.bot.deactivateItem();
            this.lastHealTime = Date.now();

            // Re-equip weapon
            await this._equipBestWeapon('melee');
            return true;
        } catch (e) {
            console.error('[CombatReflex] Heal failed:', e.message);
            return false;
        }
    }

    /**
     * Equip best weapon for given mode
     */
    async _equipBestWeapon(mode) {
        if (!this._syncBot()) return false;
        const weapon = this._getBestWeapon(mode);
        if (!weapon) return false;

        // Check if already equipped
        const held = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')];
        if (held && held.name === weapon.name) return true;

        try {
            await this.bot.equip(weapon, 'hand');
            return true;
        } catch (e) {
            console.warn(`[CombatReflex] Equip failed: ${e.message}`);
            return false;
        }
    }

    /**
     * Get best weapon using CombatUtils
     */
    _getBestWeapon(mode) {
        if (!this._syncBot()) return null;
        return CombatUtils.getBestWeapon(this.bot, mode);
    }

    /**
     * Get best food using CombatUtils
     */
    _getBestFood() {
        if (!this._syncBot()) return null;
        const items = this.bot.inventory.items();
        let bestFood = null;
        let bestScore = -999;
        const currentHeatlt = this.bot.health;

        for (const item of items) {
            const score = CombatUtils.getFoodScore(item, currentHeatlt);
            if (score > bestScore) {
                bestScore = score;
                bestFood = item;
            }
        }

        // Don't poison self unless dying
        if (bestScore < 0 && this.bot.health > 4) return null;

        return bestFood;
    }

    /**
     * Check if has arrows for bow
     */
    _hasAmmo() {
        if (!this._syncBot()) return false;
        const items = this.bot.inventory.items();
        return items.some(i => i.name === 'arrow' || i.name.includes('arrow'));
    }

    /**
     * Get armor durability
     */
    _getArmorDurability() {
        if (!this._syncBot()) return { lowest: 0 };
        const slots = ['head', 'torso', 'legs', 'feet'];
        let lowest = Infinity;

        for (const slot of slots) {
            const armor = this.bot.inventory.slots[this.bot.getEquipmentDestSlot(slot)];
            if (armor && armor.durabilityUsed !== undefined) {
                const remaining = armor.maxDurability - armor.durabilityUsed;
                if (remaining < lowest) lowest = remaining;
            }
        }

        return { lowest: lowest === Infinity ? 100 : lowest };
    }

    /**
     * Check if target is valid and alive
     */
    _isValidTarget(target) {
        if (!this._syncBot()) return false;
        if (!target) return false;
        if (!target.isValid) return false;
        if (target.metadata?.[6] !== undefined && target.metadata[6] <= 0) return false; // Dead

        const distance = this._getDistance(target);
        if (distance > 32) return false; // Too far

        return true;
    }

    /**
     * Check if target is currently attacking
     */
    _isTargetAttacking() {
        if (!this.target) return false;

        // Check if target is swinging arm or drawing bow
        // Simplified: if target is looking at us and within range
        const distance = this._getDistance(this.target);
        return distance < 4;
    }

    /**
     * Get distance to entity
     */
    _getDistance(entity) {
        if (!this._syncBot()) return Infinity;
        if (!entity?.position || !this.bot?.entity?.position) return Infinity;
        return this.bot.entity.position.distanceTo(entity.position);
    }

    /**
     * Get safe position (home or far from target)
     */
    _getSafePosition() {
        if (!this._syncBot()) return null;
        // Try to get home from memory
        if (this.agent.memory) {
            const home = this.agent.memory.getPlace('home');
            if (home) return home;
        }

        // Otherwise, position away from target
        if (this.target?.position && this.bot?.entity?.position) {
            const dir = this.bot.entity.position.minus(this.target.position).normalize();
            return this.bot.entity.position.plus(dir.scaled(30));
        }

        return null;
    }

    /**
     * Find nearby hostiles
     */
    findNearbyHostiles(radius = 10) {
        if (!this._syncBot()) return [];
        return Object.values(this.bot.entities).filter(e => {
            if (!e.position) return false;
            if (this._getDistance(e) > radius) return false;

            // Check if hostile
            return (e.type === 'mob' || e.type === 'hostile') &&
                e.name !== 'iron_golem' &&
                e.name !== 'snow_golem';
        });
    }

    /**
     * Find the entity that attacked us
     */
    findAttacker() {
        // Get nearest hostile within 8 blocks
        const hostiles = this.findNearbyHostiles(8);
        if (hostiles.length === 0) return null;

        // Sort by distance
        hostiles.sort((a, b) => this._getDistance(a) - this._getDistance(b));
        return hostiles[0];
    }

    /**
     * Get stats
     */
    getStats() {
        return { ...this.stats, inCombat: this.inCombat, state: this.state };
    }

    cleanup() {
        this.exitCombat();
        console.log('[CombatReflex] Cleaned up combat loop');
    }

    /**
     * Update parameters from Genetic Optimization
     * @param {Object} params 
     */
    updateGeneticParams(params) {
        if (params.strafeDistance) {
            // Update tactics if strafeDistance changed
            console.log(`[CombatReflex] 🧬 Updating strafeDistance to ${params.strafeDistance}`);
            // Note: strafeDistance is used in _executeEngagement
        }
        this.combatParams = { ...this.combatParams, ...params };
    }
}

export default CombatReflex;
