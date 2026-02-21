
import Vec3 from 'vec3';
import { globalBus, SIGNAL } from './SignalBus.js';

export class EnvironmentMonitor {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.active = false;
        this.intervalId = null;
        this.scanInterval = 100; // IMPROVED: Faster scan (100ms instead of 250ms)
        this.lastSignals = {}; // Debounce
<<<<<<< HEAD
        this.blackboard = agent.scheduler?.blackboard;
=======
        this.threatLevel = 'low'; // Current threat level
        this.profile = agent.config?.profile;
>>>>>>> 52ef2d406e5f976ee389560001347753dbe973f2
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.intervalId = setInterval(() => this.tick(), this.scanInterval);
<<<<<<< HEAD

        // Event Listeners for Hyper-Perception
        this._onBlockUpdate = (oldBlock, newBlock) => this._handleBlockUpdate(oldBlock, newBlock);
        this._onEntitySwing = (entity) => this._handleEntityAction('swing', entity);
        this._onEntityHurt = (entity) => this._handleEntityAction('hurt', entity);

        // Bind to bot
        if (this.bot) {
            this.bot.on('blockUpdate', this._onBlockUpdate);
            this.bot.on('entitySwing', this._onEntitySwing);
            this.bot.on('entityHurt', this._onEntityHurt);

            // Sound Effect (if supported via raw packet or plugin, generic hook)
            this.bot._client.on('sound_effect', (packet) => this._handleSound(packet));
        }

        console.log('[EnvironmentMonitor] Started with Hyper-Perception.');
=======
        console.log('[EnvironmentMonitor] Started with interval:', this.scanInterval, 'ms');
>>>>>>> 52ef2d406e5f976ee389560001347753dbe973f2
    }

    stop() {
        this.active = false;
        if (this.intervalId) clearInterval(this.intervalId);

        if (this.bot) {
            this.bot.removeListener('blockUpdate', this._onBlockUpdate);
            this.bot.removeListener('entitySwing', this._onEntitySwing);
            this.bot.removeListener('entityHurt', this._onEntityHurt);
        }
    }

    _handleBlockUpdate(oldBlock, newBlock) {
        if (!this.bot || !this.bot.entity) return;
        // Filter: Only close blocks (< 5m)
        const dist = this.bot.entity.position.distanceTo(newBlock.position);
        if (dist > 6) return;

        // Ignore air-to-air (shouldn't happen but sanity check)
        if (oldBlock.name === 'air' && newBlock.name === 'air') return;

        this._emitSignal(SIGNAL.ENV_BLOCK_CHANGE, {
            old: oldBlock.name,
            new: newBlock.name,
            position: newBlock.position,
            distance: dist
        });
    }

    _handleEntityAction(action, entity) {
        if (!this.bot || !this.bot.entity || entity === this.bot.entity) return;
        const dist = this.bot.entity.position.distanceTo(entity.position);
        if (dist > 10) return;

        this._emitSignal(SIGNAL.ENV_ENTITY_ACTION, {
            action: action,
            entity: entity.name || entity.username || 'unknown',
            position: entity.position,
            distance: dist
        });
    }

    _handleSound(packet) {
        // Rudimentary sound handler
        // Packet structure depends on version, usually has soundId or soundName
        // We just emit a generic noise signal for the Brain to interpret if needed
        const soundId = packet.soundId || packet.soundName || 'unknown';
        // Filter out common ambient noises to reduce spam?

        this._emitSignal('env_sound', {
            id: soundId,
            category: packet.category
        });
    }

    async tick() {
        if (!this.bot || !this.bot.entity) return;

        try {
            this._scanTerrain();
            this._scanEntities();
            this._trackTime();
            this._trackWeather();

            // Sync with Blackboard (Sovereign 3.1)
            if (this.blackboard) {
                this.blackboard.updatePerception({
                    biome: this.bot.biome || "unknown",
                    is_raining: this.bot.isRaining,
                    is_thundering: this.bot.isThundering,
                    time_of_day: this.bot.time.timeOfDay
                });
            }
        } catch (err) {
            console.error('[EnvironmentMonitor] Error in tick:', err);
        }
    }

    _scanTerrain() {
        // Multi-directional scan (front, left, right)
        const angles = [0, Math.PI / 4, -Math.PI / 4]; // Front, Front-Left, Front-Right
        const lookDir = this.bot.entity.yaw;
        const scanDist = 4;

        for (const angleOffset of angles) {
            const scanYaw = lookDir + angleOffset;

            for (let i = 1; i <= scanDist; i++) {
                const offset = new Vec3(
                    -Math.sin(scanYaw) * i,
                    0,
                    -Math.cos(scanYaw) * i
                );

                // Position at foot level
                const checkPos = this.bot.entity.position.plus(offset).floor();
                const blockBelow = this.bot.blockAt(checkPos.offset(0, -1, 0));

                if (!blockBelow) continue;

                // console.log(`Scanning ${offset} -> Block: ${blockBelow.name}`);

                // 1. Cliff / Hole Detection - ADAPTIVE THRESHOLD
                if (blockBelow.name === 'air' || blockBelow.name === 'void_air') {
                    const depth = this._measureDepth(checkPos);
                    // IMPROVED: Adaptive threshold based on threat level and health
                    const cliffThreshold = this._getCliffThreshold();
                    console.log(`[EnvMonitor] Found Air at ${checkPos}, Depth: ${depth}, Threshold: ${cliffThreshold}`);
                    if (depth > cliffThreshold) {
                        this.threatLevel = 'high';
                        this._emitSignal(SIGNAL.ENV_CLIFF_AHEAD, {
                            distance: i,
                            depth: depth,
                            position: checkPos,
                            direction: angleOffset === 0 ? 'front' : (angleOffset > 0 ? 'left' : 'right')
                        });
                        return; // Prioritize closest hazard
                    }
                }

                // 2. Lava Detection
                if (blockBelow.name === 'lava' || blockBelow.name === 'flowing_lava') {
                    this._emitSignal(SIGNAL.ENV_LAVA_NEARBY, {
                        distance: i,
                        position: checkPos
                    });
                    return;
                }
            }
        }
    }

    _measureDepth(pos) {
        let depth = 0;
        let currentY = pos.y - 1;
        while (currentY > -64 && depth < 20) { // Max scan depth
            const b = this.bot.blockAt(new Vec3(pos.x, currentY, pos.z));
            if (b && b.name !== 'air' && b.name !== 'void_air' && b.name !== 'cave_air') {
                // If hit liquid, count as bottom but maybe dangerous
                return depth;
            }
            depth++;
            currentY--;
        }
        return depth;
    }

    _scanEntities() {
        if (!this.bot || !this.bot.entities) return;

        // Detect nearby hostile mobs or players
        const hostiles = ['zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman', 'pillager'];

        // Get all nearby entities
        const nearbyEntities = Object.values(this.bot.entities).filter(e =>
            e !== this.bot.entity &&
            e.position.distanceTo(this.bot.entity.position) < 10
        );

        // Check for hostiles
        const nearbyHostile = nearbyEntities.find(e => hostiles.includes(e.name));
        if (nearbyHostile) {
            this._emitSignal(SIGNAL.ENV_HOSTILE_APPROACHING, {
                entity: nearbyHostile.name,
                position: nearbyHostile.position,
                distance: nearbyHostile.position.distanceTo(this.bot.entity.position)
            });
            if (this.blackboard) {
                this.blackboard.set('perception_snapshot.nearest_threat', nearbyHostile.name, 'ENV_MONITOR');
            }
        } else if (this.blackboard) {
            this.blackboard.set('perception_snapshot.nearest_threat', null, 'ENV_MONITOR');
        }

        // Check for players
        const nearbyPlayer = nearbyEntities.find(e => e.type === 'player' && e.username !== this.bot.username);
        if (nearbyPlayer) {
            this._emitSignal(SIGNAL.ENV_PLAYER_DETECTED, {
                username: nearbyPlayer.username,
                position: nearbyPlayer.position
            });
        }
    }

    _trackTime() {
        // Detect nightfall (approx time 13000)
        const time = this.bot.time.timeOfDay;
        if (time >= 12500 && time < 12600) { // Trigger once at onset
            this._emitSignal(SIGNAL.ENV_NIGHTFALL, { time });
        } else if (time >= 0 && time < 100) {
            this._emitSignal(SIGNAL.ENV_DAWN, { time });
        }
    }

    _trackWeather() {
        if (this.bot.isRaining && !this.lastSignals['raining']) {
            this._emitSignal(SIGNAL.ENV_THUNDERSTORM, { isRaining: true });
            this.lastSignals['raining'] = true;
        } else if (!this.bot.isRaining && this.lastSignals['raining']) {
            this.lastSignals['raining'] = false;
        }
    }

    _emitSignal(signal, data) {
        // Debounce signals to prevent flooding the bus
        const key = `${signal}_${JSON.stringify(data)}`; // Simple key
        const now = Date.now();
        if (this.lastSignals[key] && now - this.lastSignals[key] < 1000) {
            return;
        }
        this.lastSignals[key] = now;

        // Clean up old keys implies simplified cache or periodic clear (omitted for brevity)
        globalBus.emitSignal(signal, data);
    }

    /**
     * IMPROVED: Adaptive cliff detection threshold
     * Becomes more cautious when health is low
     */
    _getCliffThreshold() {
        // Profile-based config or defaults
        const baseThreshold = this.profile?.perception?.cliff_threshold || 3;
        const bot = this.bot;

        if (!bot) return baseThreshold;

        // Health-based adjustment: more cautious when low HP
        const healthRatio = bot.health / 20;
        let threshold = baseThreshold;

        if (healthRatio < 0.25) {
            threshold = Math.max(1, baseThreshold - 2); // Detect even 1-block holes
        } else if (healthRatio < 0.5) {
            threshold = Math.max(2, baseThreshold - 1); // Detect 2+ block holes
        }

        return threshold;
    }
}
