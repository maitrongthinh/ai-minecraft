/**
 * CombatReflex.js - The Gladiator's Instinct
 * 
 * High-performance combat reflexes handling packet manipulation and tick-perfect timing.
 * Implements W-Tap (knockback optimization), Auto-Totem, and tactical engagement.
 * 
 * State Machine: IDLE → ENGAGE → RETREAT
 */

import Vec3 from 'vec3'; // Fixed: Missing import

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
        // Base delay before attack swing, can be adjusted by shield delay gene
        this.attackCooldown = 600;

        // Stats
        this.stats = {
            kills: 0,
            damageDealt: 0,
            retreats: 0
        };

        // Training Mode (Phase 6)
        this.trainingMode = false;
        this.trainingDifficulty = 1.0;

        this._wTapBound = false;
        this._attackListener = null;

        console.log('[CombatReflex] ⚔️ Gladiator initialized');

        // Phase 3 Fix: Wire up THREAT_DETECTED Listener
        globalBus.subscribe(SIGNAL.THREAT_DETECTED, (event) => {
            if (this.trainingMode) return; // Don't interrupt training

            const { source, type, amount } = event.payload || {};
            console.log(`[CombatReflex] 🚨 Threat Detected: ${type || source} (Damage: ${amount || 0})`);

            // Phase 2: Proactive Auto-Totem (HP check + Damage burst)
            const policy = this._getRulePolicy();
            const totemThreshold = policy?.totemThreshold ?? 10;

            if (!this.bot) this._syncBot();
            if (!this.bot) return;

            if ((this.autoTotemActive || policy?.forceTotem) && (this.bot.health < totemThreshold || amount > 6)) {
                this._ensureTotemEquipped();
            }

            // If threat is from an entity (e.g. mob attack), engage logic is handled 
            if (amount > 4 && !this.inCombat) {
                if (this.agent.hitSelector) {
                    const target = this.agent.hitSelector.findThreat();
                    if (target) {
                        this.enterCombat(target);
                    }
                }
            }
        });
    }

    setTrainingMode(active, difficulty = 1.0) {
        this.trainingMode = active;
        this.trainingDifficulty = difficulty;
        console.log(`[CombatReflex] 🥊 Training Mode: ${active} (Difficulty: ${difficulty.toFixed(1)})`);
    }

    start() {
        this._syncBot();
        console.log('[CombatReflex] Gladiator started');
    }

    _syncBot() {
        const bot = this.agent?.bot || null;
        this.bot = bot;
        this.tactics.bot = bot;
        return bot;
    }

    _getRulePolicy() {
        // Phase 11 EAI: Consult Genetic Memory first
        if (this.agent?.gene) {
            const attackRange = this.agent.gene.getTrait('combat', 'attackRange') || 3.0;
            const retreatHealth = this.agent.gene.getTrait('combat', 'retreatHealth') || 6;
            const hitAndRunDistance = this.agent.gene.getTrait('combat', 'hitAndRunDistance') || 3;
            const shieldCooldownMs = this.agent.gene.getTrait('combat', 'shieldCooldownMs') || 1000;

            return {
                strafeDistance: hitAndRunDistance,
                attackUrgency: 1.0,
                reachDistance: attackRange,
                forceShield: false,
                forceTotem: false,
                totemThreshold: 10,
                retreatHealthThreshold: retreatHealth,
                shieldCooldownMs: shieldCooldownMs
            };
        }

        // Fallback Base Rule Engine Policy
        if (!this.agent?.behaviorRuleEngine || typeof this.agent.behaviorRuleEngine.getCombatPolicy !== 'function') {
            return {
                forceShield: false,
                forceTotem: false,
                totemThreshold: 10,
                retreatHealthThreshold: 6,
                strafeDistance: 2.5,
                attackUrgency: 1.0,
                reachDistance: 3.0
            };
        }

        try {
            return this.agent.behaviorRuleEngine.getCombatPolicy({
                health: this.bot?.health,
                inCombat: this.inCombat,
                state: this.state
            });
        } catch {
            return {
                forceShield: false,
                forceTotem: false,
                totemThreshold: 10,
                retreatHealthThreshold: 6,
                strafeDistance: 2.5,
                attackUrgency: 1.0,
                reachDistance: 3.0
            };
        }
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
                // ... (W-Tap logic) ...
                this.bot.setControlState('sprint', false);
                // ...
                const policy = this._getRulePolicy();
                const urgency = policy.attackUrgency || 1.0;
                const baseMean = 70 / urgency;

                const delay = Math.max(40, Math.min(120, gaussianRandom(baseMean, 15)));

                setTimeout(() => {
                    if (this.bot.entity && this.inCombat) {
                        this.bot.setControlState('sprint', true);
                    }
                }, delay);
            }
        };

        // Phase 2 Fix: Store bound wrapper to enable removal
        this._boundAttackWrapper = (attacker, victim) => {
            if (attacker === this.bot.entity) {
                if (this._attackListener) this._attackListener(victim);
            }
        };

        this.bot.on('entityAttack', this._boundAttackWrapper);
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
        if (this._wTapBound && this.bot && this._boundAttackWrapper) {
            this.bot.removeListener('entityAttack', this._boundAttackWrapper);
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
        let cleanup; // Declare first

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
                    if (cleanup) cleanup();
                }
            }
        };

        cleanup = () => {
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
        const policy = this._getRulePolicy();

        try {
            // PRIORITY 1: Check retreat conditions
            if (this._shouldRetreat()) {
                this.state = STATE.RETREAT;
                await this._executeRetreat();
                return;
            }

            // Phase 2: Auto-Totem (HP < 10)
            const totemThreshold = policy?.totemThreshold ?? 10;
            if ((this.autoTotemActive || policy?.forceTotem) && bot.health < totemThreshold) {
                const totem = bot.inventory.findInventoryItem('totem_of_undying', null);
                if (totem) {
                    const offHand = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
                    if (!offHand || offHand.name !== 'totem_of_undying') {
                        await this._ensureTotemEquipped();
                    }
                }
            }

            // PRIORITY 2: Emergency healing (HP < 8)
            if (bot.health < 8 && Date.now() - this.lastHealTime > 3000) {
                await this._emergencyHeal();
                return;
            }

            // PRIORITY 2.5: Defensive Reflexes (Shield/Totem)
            if (await this._checkDefensiveNeeds(policy)) {
                return; // Blocked action, skip attack
            }

            // PRIORITY 3: Combat actions
            if (this.state === STATE.ENGAGE) {
                // Phase 3: Trap Scanning (Adversarial)
                const trapDetected = await this._scanForTraps();
                if (trapDetected) {
                    console.log('[CombatReflex] 🛡️ Trap detected! Shifting position protocol...');
                    await this.tactics.strafe(this.target, 5.0).catch(() => { });
                } else {
                    // Phase 2: Shield Flicker (Block projectile/explosion/high damage)
                    await this._executeEngagement();
                }
            }
        } finally {
            this._isUpdating = false;
        }
    }

    async _ensureTotemEquipped() {
        if (!this.bot) return;
        const totem = this.bot.inventory.findInventoryItem('totem_of_undying', null);
        if (totem) {
            const offHand = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')];
            if (!offHand || offHand.name !== 'totem_of_undying') {
                console.log('[CombatReflex] 🛡️ Emergency Totem Swap!');
                await this.bot.equip(totem, 'off-hand').catch(() => { });
            }
        }
    }

    /**
     * Check if we need to block with shield
     */
    async _checkDefensiveNeeds(policy) {
        const bot = this.bot;
        if (!bot) return false;

        // 1. Scan for incoming projectiles
        const projectiles = Object.values(bot.entities).filter(e =>
            (e.type === 'projectile' || e.name === 'arrow' || e.name === 'trident' || e.name === 'fireball') &&
            e.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.1 // Moving
        );

        let incoming = false;
        const botPos = bot.entity.position.offset(0, 1, 0);

        for (const proj of projectiles) {
            // Check if vector points to us
            const dist = proj.position.distanceTo(botPos);
            if (dist > 30) continue;

            const trajectory = proj.velocity.clone().normalize();
            const toBot = botPos.minus(proj.position).normalize();
            const dot = trajectory.dot(toBot);

            if (dot > 0.9) { // 90% aligned towards us
                incoming = true;
                // Face the projectile to block it
                await bot.lookAt(proj.position);
                break;
            }
        }

        // 2. Scan for fusing Creepers
        const nearbyCreepers = Object.values(bot.entities).filter(e =>
            e.type === 'mob' && e.mobType === 'Creeper' &&
            e.position.distanceTo(botPos) < 5 &&
            e.metadata?.[16] === 1 // Fusing state (check version specific metadata, often 16 or 15)
            // For 1.20.1 it is usually index 16 for state (1=fused, -1=idle) or similar.
            // Safe bet: if it's close and we are fighting it, block? 
            // Actually, metadata[16] == 1 is fusion.
        );

        if (nearbyCreepers.length > 0) {
            incoming = true;
            await bot.lookAt(nearbyCreepers[0].position);
        }

        // Action
        const shield = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
        const hasShield = shield && shield.name === 'shield';

        if ((incoming || policy?.forceShield) && hasShield) {
            bot.activateItem(true); // secondary hand check? usually activateItem(true) is offhand
            // But mineflayer: activateItem(offhand?)
            // bot.activateItem(true) means offhand in some versions? 
            // Standard: bot.activateItem() uses main hand.
            // If shield is in offhand, we need bot.activateItem(true) ? No, bot.activateItem() acts on current held item??
            // Actually, blocking with shield in offhand happens when using right click (activateItem).
            bot.activateItem();
            return true;
        } else if (incoming && !hasShield) {
            // Dodge!
            const target = nearbyCreepers[0] || projectiles[0];
            if (target) {
                this.tactics.strafe(target, 8); // Run away
            }
            return false; // Not blocking, but handling
        }

        // Lower shield if strictly safe and not forced
        if (!incoming && !policy?.forceShield) {
            bot.deactivateItem();
        }

        return false;
    }

    // ... existing code ...

    /**
     * Attempt critical hit (jump + fall + attack)
     */
    async _attemptCritAttack() {
        if (!this._syncBot()) return;
        const now = Date.now();

        // Training Mode Adjustment
        let cooldown = this.attackCooldown;
        if (this.trainingMode) {
            cooldown = this.attackCooldown / this.trainingDifficulty;
        }

        if (now - this.lastAttackTime < cooldown) return;

        const velocity = this.bot.entity.velocity;

        // CRIT CONDITION: Falling (Standard Minecraft Crit)
        // Verify with PhysicsPredictor logic or simple velocity check
        // standard gravity is -0.0784000015258789
        const isFalling = velocity.y < -0.078;

        if (isFalling) {
            const latency = this.bot.player.ping || 50; // default 50ms
            // Use HitSelector if available for accuracy
            const canHit = this.agent.hitSelector
                ? this.agent.hitSelector.canHit(this.target, 3.0, latency)
                : this.bot.entity.position.distanceTo(this.target.position) <= 3.0;

            if (canHit) {
                this.bot.attack(this.target);
                this.lastAttackTime = now;
                // Emit crit particle feedback via logic? (Client side only)
            }
            return;
        }

        // Initiate Jump if on ground to start crit chain
        if (this.bot.entity.onGround) {
            this.bot.setControlState('jump', true);
            // Short burst
            setTimeout(() => this.bot.setControlState('jump', false), 50);
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

    /**
     * Determine if we should retreat based on health/situation
     */
    _shouldRetreat() {
        if (!this.bot) return false;
        const threshold = this.combatPolicy?.retreatHealthThreshold || 8;
        return this.bot.health < threshold;
    }
}

export default CombatReflex;
