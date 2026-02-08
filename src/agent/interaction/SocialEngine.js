import { SocialProfile } from './SocialProfile.js';
import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * SocialEngine: Master Social Trust & Interaction Controller
 * 
 *
 * Merges legacy HumanManager and NPCController.
 * Manage trust levels, dialogue history, and autonomous social goals.
 */
export class SocialEngine {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.profiles = new Map(); // PlayerName -> SocialProfile

        // Whitelist Unified (Doomsday Hardening)
        const security = agent.config?.profile?.security || {};
        this.FRIENDS = security.whitelist || [];
        this.ADMINS = ['Steve', 'Admin', 'Dev']; // System level admins

        this.npcGoals = [];
        this.socialInterval = null;

        this.init();
    }

    init() {
        if (!this.bot) return;

        // Store listeners for cleanup (Phase 6 Fix)
        this._joinListener = (player) => this.ensureProfile(player.username);
        this._chatListener = (username, message) => this.handleChatInteraction(username, message);

        this.bot.on('playerJoined', this._joinListener);
        this.bot.on('chat', this._chatListener);

        // Task 34: Active Interaction Loop
        this.socialInterval = setInterval(() => this.updateSocialInitiative(), 60000);
        console.log('[SocialEngine] Intelligence layer ready');
    }

    cleanup() {
        if (this.socialInterval) clearInterval(this.socialInterval);
        this.socialInterval = null;

        if (this.bot) {
            console.log('[SocialEngine] 🧹 Removing bot listeners...');
            if (this._joinListener) this.bot.removeListener('playerJoined', this._joinListener);
            if (this._chatListener) this.bot.removeListener('chat', this._chatListener);
        }

        this._joinListener = null;
        this._chatListener = null;
        console.log('[SocialEngine] Cleaned up social system');
    }

    /**
     * Get or create a social profile for a player/entity
     */
    getProfile(name) {
        if (!this.profiles.has(name)) {
            this.profiles.set(name, new SocialProfile(name));
        }
        return this.profiles.get(name);
    }

    ensureProfile(username) {
        if (!this.profiles.has(username)) {
            const profile = new SocialProfile(username);

            // Hardcoded trust for whitelisted
            if (this.ADMINS.includes(username)) {
                profile.trustScore = 100;
                profile.role = 'admin';
            } else if (this.FRIENDS.includes(username)) {
                profile.trustScore = 50;
                profile.role = 'friend';
            }

            this.profiles.set(username, profile);
        }
        return this.profiles.get(username);
    }

    /**
     * Context-aware Intruder Detection
     */
    checkIntruders(nearbyPlayers) {
        return nearbyPlayers.filter(p => {
            // 1. Friend/SAFE Check
            if (this.FRIENDS.includes(p.username) || this.ADMINS.includes(p.username)) return false;

            const profile = this.getProfile(p.username);

            // 2. Trust Check (If trusted, ignore)
            if (profile.trustScore > 0) return false;

            // 3. Distance Check (Hard limit 15 blocks)
            const dist = p.entity.position.distanceTo(this.bot.entity.position);
            if (dist > 15) return false;

            // 4. Raycast / Line of Sight Check (No Wall Hacks)
            // blocks line of sight check
            const lineOfSight = this.bot.canSeeBlock(this.bot.blockAt(p.entity.position.offset(0, 1.6, 0)));
            // Better: bot.canSeeEntity(p.entity) ??
            // Mineflayer's canSeeBlock is robust for blocks. For entities, canSeeEntity is better but heavier.
            // Let's use a custom lightweight raycast or canSeeBlock on their eye level.
            if (!lineOfSight) return false;

            // 5. FOV Check (Don't have eyes in back of head)
            // Unless hearing? (TODO: Add Hearing System)
            // For now, strict vision.
            const fov = 120 * (Math.PI / 180); // 120 degrees in radians
            const entityPos = p.entity.position.offset(0, p.entity.height, 0);
            const rawView = this.bot.entity.yaw;
            // Calculate angle to target
            const delta = entityPos.minus(this.bot.entity.position);
            const angle = Math.atan2(-delta.x, -delta.z); // Mineflayer yaw is weird

            // Normalize angle diff
            let diff = Math.abs(angle - rawView);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;

            if (diff > fov / 2) {
                // Behind or out of peripheral vision
                // Add chance to "hear" them if close?
                if (dist < 3) return true; // Hear them if very close
                return false;
            }

            return true;
        });
    }


    /**
     * Unified interaction handler
     */
    async handleChatInteraction(entityName, message) {
        const profile = this.getProfile(entityName);
        console.log(`[SocialEngine] Interacting with ${entityName} (Trust: ${profile.trust})`);

        // Update trust based on sentiment (Simple placeholder for now)
        if (message.includes('good') || message.includes('thanks')) {
            profile.addTrust(1);
        } else if (message.includes('bad') || message.includes('kill')) {
            profile.addTrust(-5);
        }

        // Emit signal for Brain to react
        globalBus.emitSignal(SIGNAL.SOCIAL_INTERACTION, {
            entity: entityName,
            trust: profile.trust,
            message
        });

        // Auto-reply logic if trust is high? (Managed by Brain usually)
    }

    async updateSocialInitiative() {
        if (!this.bot?.entities) return;

        // Periodic check for nearby people to greet/ignore
        const nearby = Object.values(this.bot.entities).filter(e =>
            e.type === 'player' &&
            e.username !== this.bot.username &&
            e.position.distanceTo(this.bot.entity.position) < 10
        );

        for (const p of nearby) {
            const profile = this.ensureProfile(p.username);

            // If Friend: Warm greeting if not seen recently
            if (this.FRIENDS.includes(p.username)) {
                if (!profile.lastGreeting || Date.now() - profile.lastGreeting > 300000) {
                    this.agent.speak(`Chào bồ, ${p.username}! Bạn cần giúp gì không?`);
                    profile.lastGreeting = Date.now();
                }
            }

            // If unknown/intruder: Don't greet here (Handled by territorial update in agent.js)
        }

        // Trust decay over time (passive)
        for (const [name, profile] of this.profiles) {
            if (profile.trustScore > 0 && !this.FRIENDS.includes(name)) {
                profile.trustScore -= 0.1; // Gentle decay
            }
        }
    }

    /**
     * NPC Goal Management (from NPCController)
     */
    addGoal(goal) {
        this.npcGoals.push(goal);
        console.log(`[SocialEngine] 🎯 New autonomous goal: ${goal.description}`);
    }

    async update(delta) {
        // Periodic social updates (relationship decay, goal checking)
        for (const goal of this.npcGoals) {
            if (!goal.isCompleted()) {
                await goal.tick(this.agent, delta);
            }
        }
    }
}
