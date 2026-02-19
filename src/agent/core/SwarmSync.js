/**
 * SwarmSync.js - The Sovereign Swarm Coordinator
 * 
 * Implements Zero-Trust P2P communication between multiple MindOS instances.
 * Enables coordinated target acquisition, shared world state, and flocking formations.
 */

import { globalBus, SIGNAL } from './SignalBus.js';

export const SWARM_ROLE = {
    LONE_WOLF: 'lone_wolf',
    LEADER: 'leader',
    FOLLOWER: 'follower',
    SCOUT: 'scout',
    TANK: 'tank',
    DPS: 'dps'
};

export class SwarmSync {
    constructor(agent) {
        this.agent = agent;
        this.peers = new Map(); // Name -> { lastSeen, position, target, role, metaRole }
        this.swarmId = 'SOVEREIGN_SWARM';
        this.heartbeatInterval = 5000; // Relaxed from 2000

        this.metaRole = SWARM_ROLE.LONE_WOLF; // Strategic Role
        this.combatRole = 'DPS'; // Tactical Role
        this.leader = null;

        // Protocol markers
        this.PROTO_PREFIX = 'Σ'; // Sigma for Swarm

        // Instead of immediate setup, wait for spawn to avoid null bot crash
        globalBus.subscribe(SIGNAL.BOT_SPAWNED, () => {
            this._setupListeners();
            this.startHeartbeat();
        });
    }

    _setupListeners() {
        // CRITICAL: Safety check - bot must exist and be spawned
        if (!this.agent.bot || !this.agent.bot.entity) {
            console.warn('[SwarmSync] ⚠️ _setupListeners called before bot ready. Deferring...');
            setTimeout(() => this._setupListeners(), 500);
            return;
        }

        // Listen for incoming whispers from potential teammates
        this.agent.bot.on('whisper', (username, message) => {
            if (message.startsWith(this.PROTO_PREFIX)) {
                this._handleProtocolMessage(username, message.slice(1));
            }
        });

        // Broadcast local state changes to the swarm
        globalBus.subscribe(SIGNAL.ENGAGED_TARGET, (event) => {
            this.broadcast('TARGET_SHARED', {
                targetId: event.payload.targetId,
                priority: event.payload.priority || 1
            });
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) return;

        // Safety: Ensure bot is ready before heartbeat
        if (!this.agent.bot || !this.agent.bot.entity) {
            console.warn('[SwarmSync] ⚠️ startHeartbeat called before bot ready. Deferring...');
            setTimeout(() => this.startHeartbeat(), 500);
            return;
        }

        this.heartbeatTimer = setInterval(() => {
            if (!this.agent.bot?.entity) return;

            this.broadcast('HEARTBEAT', {
                pos: this.agent.bot.entity.position,
                hp: this.agent.bot.health,
                target: this.agent.combatReflex?.target?.username || null,
                combatRole: this._determineCombatRole(),
                metaRole: this.metaRole
            });

            this._cleanupPeers();
        }, this.heartbeatInterval);
    }

    _determineCombatRole() {
        // Logic to determine role (TANK, DPS, SCOUT) based on equipment/health
        if (this.agent.bot.health < 10) return 'RETREATER';
        const hasShield = this.agent.bot.inventory.findInventoryItem('shield', null);
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

                // Detection: If I see a Leader, and I am Lone Wolf, I follow?
                if (payload.metaRole === SWARM_ROLE.LEADER && this.metaRole === SWARM_ROLE.LONE_WOLF) {
                    console.log(`[SwarmSync] 🫡 Recognized Leader: ${sender}. Following.`);
                    this.leader = sender;
                    this.setMetaRole(SWARM_ROLE.FOLLOWER);
                    if (this.agent.scheduler?.blackboard) {
                        this.agent.scheduler.blackboard.set('swarm_state.leader', sender, 'SWARM');
                    }
                }

            } else if (type === 'TARGET_SHARED') {
                console.log(`[SwarmSync] 🎯 Shared Target received from ${sender}: ${payload.targetId}`);
                if (this.agent.combatReflex && !this.agent.combatReflex.inCombat) {
                    const entity = this.agent.bot.nearestEntity(e => e.username === payload.targetId || e.uuid === payload.targetId);
                    if (entity) this.agent.combatReflex.enterCombat(entity);
                }
            } else if (type === 'ROLE_ASSIGN') {
                if (payload.target === this.agent.name) {
                    console.log(`[SwarmSync] 👑 Assigned Role: ${payload.newRole} by ${sender}`);
                    this.setMetaRole(payload.newRole);
                    if (sender !== this.agent.name) {
                        this.leader = sender;
                        if (this.agent.scheduler?.blackboard) {
                            this.agent.scheduler.blackboard.set('swarm_state.leader', sender, 'SWARM');
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore malformed protocol messages
        }
    }

    assignRole(target, newRole) {
        console.log(`[SwarmSync] Assigning ${newRole} to ${target}`);
        this.broadcast('ROLE_ASSIGN', {
            sender: this.agent.name,
            target: target,
            newRole: newRole
        });
    }

    setMetaRole(role) {
        this.metaRole = role;
        if (this.agent.scheduler?.blackboard) {
            this.agent.scheduler.blackboard.set('swarm_state.role', role, 'SWARM');
        }
    }

    broadcast(type, payload) {
        // Safety check for bot
        if (!this.agent.bot) return;

        const message = this.PROTO_PREFIX + JSON.stringify({ type, payload });
        const teammates = this.agent.collaboration?.teammates || [];

        for (const name of teammates) {
            if (name === this.agent.name) continue;
            try {
                this.agent.bot.whisper(name, message);
            } catch (err) {
                console.warn(`[SwarmSync] Failed to whisper to ${name}:`, err.message);
            }
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
            const dist = this.agent.bot.entity.position.distanceTo(peerPos);

            if (dist < 3) {
                repulsion = repulsion.add(this.agent.bot.entity.position.minus(peerPos).normalize());
            } else if (dist > 8) {
                cohesion = cohesion.add(peerPos.minus(this.agent.bot.entity.position).normalize());
            }
        }

        return repulsion.scaled(0.5).add(cohesion.scaled(0.2));
    }
}

export default SwarmSync;
