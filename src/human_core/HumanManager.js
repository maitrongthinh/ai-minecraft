
import fs from 'fs';
import path from 'path';
import { Movements } from 'mineflayer-pathfinder';
import { SocialProfile } from './SocialProfile.js';

export class HumanManager {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.profiles = new Map(); // Name -> SocialProfile
        this.savePath = './bots/' + agent.name + '/memory/social_graph.json';
        this.active = true;
        this.init();
    }

    init() {
        this.loadProfiles();

        // Listen to events
        this.bot.on('playerJoined', (player) => this.ensureProfile(player.username));
        this.bot.on('chat', (username, message) => this.handleChatInteraction(username, message));

        // Task 31: Physical Interaction Trust
        this.bot.on('entityHurt', (entity) => {
            if (entity === this.bot.entity) {
                // Try to find attacker
                // Mineflayer entityHurt doesn't give attacker directly, 
                // but we can check nearby players or use 'onDamage' event if available differently.
                // For now, heuristic: if a player is very close and swinging hand?
                // Simplified: We rely on chat for now.
            }
        });

        // Periodic Save
        setInterval(() => this.saveProfiles(), 60000 * 5); // Autosave every 5 mins

        // Task 34: Active Interaction Loop (Every 60s)
        setInterval(() => this.updateSocialInitiative(), 60000);

        // Admin List (Hardcoded for safety bootstrap)
        this.ADMINS = ['admin', 'Steve', 'Dev'];

        console.log('[HumanManager] Social Graph initialized.');
    }

    ensureProfile(username) {
        if (!this.profiles.has(username)) {
            console.log(`[HumanManager] New profile created for: ${username}`);
            const profile = new SocialProfile(username);

            // Task 31: Auto-Admin check
            if (this.ADMINS.includes(username)) {
                profile.trustScore = 100;
                profile.role = 'admin';
                console.log(`[HumanManager] auto-recognized admin: ${username}`);
            }

            this.profiles.set(username, profile);
        }
        return this.profiles.get(username);
    }

    getProfile(username) {
        return this.ensureProfile(username);
    }

    /**
     * Update trust based on user interaction
     */
    handleChatInteraction(username, message) {
        if (username === this.bot.username) return;

        const profile = this.ensureProfile(username);
        profile.recordInteraction('chat');

        // Task 31: Simple Sentiment - Adjust Trust
        const msg = message.toLowerCase();

        // Positive Triggers
        if (msg.includes('good bot') || msg.includes('thanks') || msg.includes('thank you') || msg.includes('gj')) {
            profile.updateTrust(1, 'polite chat');
            this.agent.openChat(`Thanks ${username}! (Trust: ${profile.trustScore})`);
        }

        // Negative Triggers
        else if (msg.includes('bad bot') || msg.includes('stupid') || msg.includes('useless')) {
            profile.updateTrust(-2, 'insult');
            this.agent.openChat(`That's not nice. (Trust: ${profile.trustScore})`);
        }

        // Threats
        else if (msg.includes('die') || msg.includes('kill') || msg.includes('destroy')) {
            profile.updateTrust(-5, 'threat');
            this.agent.openChat(`I don't like threats. (Trust: ${profile.trustScore})`);
        }
    }

    /**
     * Task 31: Check if a user is trusted enough for an action
     * @param {string} username 
     * @param {string} actionType - 'normal', 'destructive', 'admin'
     */
    isTrusted(username, actionType = 'normal') {
        const profile = this.ensureProfile(username);
        const score = profile.trustScore;

        if (actionType === 'admin') return score >= 90;
        if (actionType === 'destructive') return score >= 50; // Need reasonable trust to destroy stuff
        if (actionType === 'normal') return score >= 0; // Untrusted (negative) can't do much

        return false;
    }

    /**
     * Task 34: Proactive Social Loop
     * Checks nearby players and initiates chat if trusted and idle
     */
    async updateSocialInitiative() {
        if (!this.active || !this.agent.bot) return;

        // 1. Get nearby players
        const nearby = Object.values(this.agent.bot.players).filter(p => {
            if (p.username === this.agent.bot.username) return false;
            const entity = p.entity;
            if (!entity) return false;
            return entity.position.distanceTo(this.agent.bot.entity.position) < 10; // Within 10 blocks
        });

        if (nearby.length === 0) return;

        // 2. Pick a candidate (Trusted only)
        for (const p of nearby) {
            const profile = this.getProfile(p.username);

            // Only chat if trusted (>0) and we haven't chatted recently
            // TODO: Add 'lastChatTime' to profile to prevent spam
            if (profile.trustScore > 5) {
                // Determine greeting
                let greeting = `Hello ${p.username}!`;
                if (this.agent.bot.time.timeOfDay > 13000) greeting = `Careful, it's dark out there ${p.username}.`;

                // Try to start
                const started = await this.agent.convoManager.tryInitiateConversation(p.username, greeting);
                if (started) break; // Only talk to one person at a time
            }
        }
    }

    async loadProfiles() {
        try {
            if (fs.existsSync(this.savePath)) {
                const data = fs.readFileSync(this.savePath, 'utf8');
                const json = JSON.parse(data);
                for (const p of json) {
                    this.profiles.set(p.name, SocialProfile.fromJSON(p));
                }
                console.log(`[HumanManager] Loaded ${this.profiles.size} social profiles.`);
            }
        } catch (e) {
            console.error('[HumanManager] Failed to load profiles:', e);
        }
    }

    async saveProfiles() {
        try {
            const dir = path.dirname(this.savePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const list = Array.from(this.profiles.values()).map(p => p.toJSON());
            fs.writeFileSync(this.savePath, JSON.stringify(list, null, 2));
            // console.log('[HumanManager] Saved profiles.');
        } catch (e) {
            console.error('[HumanManager] Failed to save profiles:', e);
        }
    }

    // --- Legacy Instinct Logic (Preserved) ---

    checkSafety(username) {
        const profile = this.getProfile(username);
        if (profile.role === 'enemy') {
            console.warn(`[HumanManager] Warning: Enemy ${username} nearby!`);
            this.fleeFrom(username);
            return false;
        }
        return true;
    }

    async fleeFrom(username) {
        // ... existing flee logic or improved specific-target flee
        const player = this.bot.players[username]?.entity;
        if (!player) return;

        console.log(`[HumanManager] Fleeing from enemy: ${username}`);
        // ... (Implementation of flee similar to previous code)
    }

    // Re-implementing previous flee/findFood as placeholders to keep compatibility
    async findFood() {
        if (!this.active) return;
        if (this.bot.autoEat) {
            try { await this.bot.autoEat.eat(); } catch (e) { }
        }
    }
}
