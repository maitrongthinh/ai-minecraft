import { SocialProfile } from '../npc/SocialProfile.js';
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

        // Whitelist for "Tử huyệt" fix
        this.FRIENDS = ['Steve', 'Alex', 'MaiTrongThinh']; // Expanded via config eventually
        this.ADMINS = ['Steve', 'Admin', 'Dev'];

        this.npcGoals = [];

        this.init();
    }

    init() {
        if (this.bot) {
            this.bot.on('playerJoined', (player) => this.ensureProfile(player.username));
            this.bot.on('chat', (username, message) => this.handleChatInteraction(username, message));
        }

        // Task 34: Active Interaction Loop
        setInterval(() => this.updateSocialInitiative(), 60000);
        console.log('[SocialEngine] Intelligence layer ready');
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
            if (this.FRIENDS.includes(p.username) || this.ADMINS.includes(p.username)) return false;

            const profile = this.getProfile(p.username);
            return profile.trustScore < -5 || p.entity.position.distanceTo(this.bot.entity.position) < 5;
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

    /**
     * NPC Goal Management (from NPCController)
     */
    addGoal(goal) {
        this.npcGoals.push(goal);
        console.log(`[SocialEngine] 🎯 New autonomous goal: ${goal.description}`);
    }

    async update() {
        // Periodic social updates (relationship decay, goal checking)
        for (const goal of this.npcGoals) {
            if (!goal.isCompleted()) {
                await goal.tick(this.agent);
            }
        }
    }
}
