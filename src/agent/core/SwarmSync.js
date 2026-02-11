/**
 * SwarmSync.js - The Sovereign Swarm Coordinator
 * 
 * Implements Zero-Trust P2P communication between multiple MindOS instances.
 * Enables coordinated target acquisition, shared world state, and flocking formations.
 */

import { globalBus, SIGNAL } from './SignalBus.js';

export class SwarmSync {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.peers = new Map(); // Name -> { lastSeen: Number, position: Vec3, target: String, role: String }
        this.swarmId = 'SOVEREIGN_SWARM';
        this.heartbeatInterval = 2000;

        // Protocol markers
        this.PROTO_PREFIX = 'Σ'; // Sigma for Swarm

        this._setupListeners();
    }

    _setupListeners() {
        // Listen for incoming whispers from potential teammates
        this.bot.on('whisper', (username, message) => {
            if (message.startsWith(this.PROTO_PREFIX)) {
                this._handleProtocolMessage(username, message.slice(1));
            }
        });

        // Broadcast local state changes to the swarm
        globalBus.subscribe(SIGNAL.BOT_SPAWNED, () => this.startHeartbeat());

        globalBus.subscribe(SIGNAL.ENGAGED_TARGET, (event) => {
            this.broadcast('TARGET_SHARED', {
                targetId: event.payload.targetId,
                priority: event.payload.priority || 1
            });
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) return;

        this.heartbeatTimer = setInterval(() => {
            if (!this.bot.entity) return;

            this.broadcast('HEARTBEAT', {
                pos: this.bot.entity.position,
                hp: this.bot.health,
                target: this.agent.combatReflex?.target?.username || null,
                role: this._determineRole()
            });

            this._cleanupPeers();
        }, this.heartbeatInterval);
    }

    _determineRole() {
        // Logic to determine role (TANK, DPS, SCOUT) based on equipment/health
        if (this.bot.health < 10) return 'RETREATER';
        const hasShield = this.bot.inventory.findInventoryItem('shield', null);
        return hasShield ? 'TANK' : 'DPS';
    }

    _handleProtocolMessage(sender, rawData) {
        try {
            const { type, payload } = JSON.parse(rawData);

            if (type === 'HEARTBEAT') {
                this.peers.set(sender, {
                    ...payload,
                    lastSeen: Date.now()
                });
            } else if (type === 'TARGET_SHARED') {
                console.log(`[SwarmSync] 🎯 Shared Target received from ${sender}: ${payload.targetId}`);
                // Notify CombatReflex if idle
                if (this.agent.combatReflex && !this.agent.combatReflex.inCombat) {
                    const entity = this.bot.nearestEntity(e => e.username === payload.targetId || e.uuid === payload.targetId);
                    if (entity) this.agent.combatReflex.enterCombat(entity);
                }
            }
        } catch (e) {
            // Ignore malformed protocol messages
        }
    }

    broadcast(type, payload) {
        const message = this.PROTO_PREFIX + JSON.stringify({ type, payload });
        const teammates = this.agent.collaboration?.teammates || [];

        for (const name of teammates) {
            if (name === this.agent.name) continue;
            this.bot.whisper(name, message);
        }
    }

    _cleanupPeers() {
        const now = Date.now();
        for (const [name, data] of this.peers.entries()) {
            if (now - data.lastSeen > 10000) {
                this.peers.delete(name);
                console.log(`[SwarmSync] 👋 Peer ${name} timed out.`);
            }
        }
    }

    /**
     * Get flocking vector to stay near teammates but not too close
     */
    async getFlockingVector() {
        const vec3 = (await import('vec3')).default;
        let repulsion = new vec3(0, 0, 0);
        let cohesion = new vec3(0, 0, 0);

        if (this.peers.size === 0) return repulsion;

        for (const peer of this.peers.values()) {
            const peerPos = new vec3(peer.pos.x, peer.pos.y, peer.pos.z);
            const dist = this.bot.entity.position.distanceTo(peerPos);

            if (dist < 3) {
                repulsion = repulsion.add(this.bot.entity.position.minus(peerPos).normalize());
            } else if (dist > 8) {
                cohesion = cohesion.add(peerPos.minus(this.bot.entity.position).normalize());
            }
        }

        return repulsion.scaled(0.5).add(cohesion.scaled(0.2));
    }
}

export default SwarmSync;
