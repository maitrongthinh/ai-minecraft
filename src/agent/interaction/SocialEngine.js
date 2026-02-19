import { SocialProfile } from './SocialProfile.js';
import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { SocialAuth } from './SocialAuth.js';
import { DialogueSystem } from './DialogueSystem.js';

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
        this.auth = new SocialAuth(agent);
        this.dialogue = new DialogueSystem(agent); // Phase 7: Dialogue

        // Whitelist Unified (Doomsday Hardening)
        const security = agent.config?.profile?.security || {};
        this.FRIENDS = security.whitelist || [];
        this.ADMINS = ['Steve', 'Admin', 'Dev']; // System level admins

        this.npcGoals = [];
        this.socialInterval = null;

        this.init();
    }

    async _speak(message) {
        if (!message) return;
        try {
            if (typeof this.agent?.openChat === 'function') {
                await this.agent.openChat(message);
                return;
            }
            if (this.bot && typeof this.bot.chat === 'function') {
                this.bot.chat(String(message));
            }
        } catch (error) {
            console.warn('[SocialEngine] Failed to speak:', error.message);
        }
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

    rebind(bot) {
        this.cleanup();
        this.bot = bot;
        this.init();
        console.log('[SocialEngine] 🔄 Rebound to new bot instance');
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
        // Ignore self (Prevent Infinite Loops)
        if (entityName === this.bot.username) return;

        const profile = this.getProfile(entityName);
        const msg_low = message.toLowerCase();

        console.log(`[SocialEngine] Interacting with ${entityName}: "${message}"`);

        // --- PHASE 7: AUTHENTICATION CHECK ---
        // 1. Check for Handshake
        if (this.auth.verifyHandshake(entityName, message)) {
            await this._speak(`Access granted, ${entityName}. Session active for 30 minutes.`);
            profile.trustScore = 100; // Boost trust
            profile.role = 'temp_admin';
            return;
        }

        // --- PHASE 7: DIALOGUE SYSTEM ---
        // 2. Structured Dialogue Processing
        // Try to handle message locally before asking LLM
        const handledByDialogue = await this.dialogue.processMessage(entityName, message);
        if (handledByDialogue) return;

        // 3. Check Permissions for Commands
        const isCommand = message.trim().startsWith('!') ||
            msg_low.includes('come here') ||
            msg_low.includes('follow me') ||
            msg_low.includes('go to');

        if (isCommand) {
            const isAuth = this.auth.isAuthenticated(entityName);
            const isWhitelisted = this.ADMINS.includes(entityName) || this.FRIENDS.includes(entityName);

            if (!isAuth && !isWhitelisted) {
                console.log(`[SocialEngine] 🛡️ Blocked unauthorized command from ${entityName}`);
                // Only reply occasionally to avoid spam loops
                if (Math.random() < 0.3) {
                    await this._speak(`I cannot obey you, ${entityName}. Authentication required.`);
                }
                return;
            }
        }
        // -------------------------------------

        // 0. Human Override (Voice of God)
        // If an admin sends a direct command (starts with !), it takes priority over AI planning
        if ((profile.role === 'admin' || this.auth.isAuthenticated(entityName)) && message.trim().startsWith('!')) {
            const command = message.trim().substring(1).trim();
            console.log(`[SocialEngine] ⚡ VOICE OF GOD detected from ${entityName}: "${command}"`);

            globalBus.emitSignal(SIGNAL.HUMAN_OVERRIDE, {
                source: entityName,
                command: command,
                payload: {
                    goal: command // Route as a new goal for System 2 to override current plan
                }
            });
            await this._speak(`Overriding current plan. Executing: ${command}`);
            return;
        }

        // 1. Instruction Learning (Rule-based)
        if (this.agent.instructionLearner) {
            const rule = this.agent.instructionLearner.handleChatMessage(entityName, message);
            if (rule) {
                await this._speak(`Understood. I will ${rule.intent.replace(/_/g, ' ')}.`);
                return;
            }
        }

        // 2. Wiki Knowledge Query
        // Detect questions: "how to", "what is", "recipe for"
        if (msg_low.includes('how to') || msg_low.includes('what is') || msg_low.includes('recipe') || msg_low.includes('craft')) {
            if (this.agent.wiki) {
                await this._speak(`Let me check the archives for "${message}"...`);

                // Heuristic: Extract keyword
                let term = message.replace(/how to|what is|recipe for|craft/gi, '').replace(/\?/g, '').trim();

                // Recipe specific
                if (msg_low.includes('recipe') || msg_low.includes('craft')) {
                    const recipe = await this.agent.wiki.searchRecipe(term);
                    if (recipe && recipe.recipes && recipe.recipes.length > 0) {
                        const r = recipe.recipes[0];
                        await this._speak(`To craft ${r.output}, you need: ${r.ingredients.join(', ')}.`);
                        return;
                    }
                }

                // General info
                const info = await this.agent.wiki.searchGeneral(term);
                if (info && info.summary) {
                    // Summarize for chat (first sentence)
                    const shortSummary = info.summary.split('.')[0] + '.';
                    await this._speak(`${info.title}: ${shortSummary}`);
                    return;
                }

                await this._speak(`I couldn't find anything about ${term} in the archives.`);
                return;
            }
        }

        // 3. Sentiment & Trust (Legacy)
        const positive = ['good', 'thanks', 'cảm ơn', 'giỏi', 'hay', 'nice', 'friend', 'bạn'];
        const negative = ['bad', 'kill', 'giết', 'ngu', 'die', 'chết', 'hate', 'ghét', 'trash'];

        let sentiment = 0;
        positive.forEach(word => { if (msg_low.includes(word)) sentiment += 2; });
        negative.forEach(word => { if (msg_low.includes(word)) sentiment -= 5; });

        if (sentiment !== 0) {
            profile.trustScore = Math.max(0, Math.min(100, profile.trustScore + sentiment));
            console.log(`[SocialEngine] Trust updated for ${entityName}: ${profile.trustScore} (Delta: ${sentiment})`);

            // Update Blackboard
            if (this.agent.scheduler?.blackboard) {
                // This is expensive to do every chat, maybe optimize? 
                // For now, it's fine.
                const trusted = Array.from(this.profiles.values())
                    .filter(p => p.trustScore > 20)
                    .map(p => p.username);
                this.agent.scheduler.blackboard.set('social_context.trusted_players', trusted, 'SOCIAL');
            }
        }

        // Emit signal for Brain to react (LLM Fallback)
        globalBus.emitSignal(SIGNAL.SOCIAL_INTERACTION, {
            entity: entityName,
            trust: profile.trustScore,
            message,
            sentiment: sentiment > 0 ? 'positive' : (sentiment < 0 ? 'negative' : 'neutral')
        });
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
                    await this._speak(`Chào bồ, ${p.username}! Bạn cần giúp gì không?`);
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
