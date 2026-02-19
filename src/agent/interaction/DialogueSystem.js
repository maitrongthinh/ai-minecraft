import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { SocialAuth } from './SocialAuth.js';

/**
 * DialogueSystem: Structured Interaction Handler
 *
 * Use regex-based intent recognition to handle common social interactions
 * without consuming expensive LLM tokens for every chat message.
 */
export class DialogueSystem {
    constructor(agent) {
        this.agent = agent;
        this.intents = [
            {
                id: 'GREET',
                regex: /\b(hi|hello|hey|chao|alo)\b/i,
                handler: this.handleGreeting.bind(this)
            },
            {
                id: 'STATUS',
                regex: /\b(status|health|hp|suc khoe|tinh hinh)\b/i,
                handler: this.handleStatus.bind(this)
            },
            {
                id: 'FOLLOW',
                regex: /\b(follow|come|di theo|lai day)\b/i,
                authRequired: true,
                handler: this.handleFollow.bind(this)
            },
            {
                id: 'STOP',
                regex: /\b(stop|dung|wait|cho da)\b/i,
                authRequired: true,
                handler: this.handleStop.bind(this)
            },
            {
                id: 'REPORT',
                regex: /\b(report|bao cao)\b/i,
                authRequired: true,
                handler: this.handleReport.bind(this)
            }
        ];
    }

    /**
     * Process an incoming message
     * @param {string} username - Sender
     * @param {string} message - Content
     * @returns {boolean} True if handled locally
     */
    async processMessage(username, message) {
        const cleanMsg = message.trim();

        for (const intent of this.intents) {
            if (intent.regex.test(cleanMsg)) {
                // Check Auth if required
                if (intent.authRequired) {
                    if (!this.agent.social.auth.isAuthenticated(username) &&
                        !this.agent.social.ADMINS.includes(username)) {
                        await this.agent.social._speak(`Authentication required for ${intent.id} command.`);
                        return true; // Handled (rejected)
                    }
                }

                console.log(`[DialogueSystem] Intent Detected: ${intent.id} from ${username}`);
                await intent.handler(username, cleanMsg);
                return true; // Handled
            }
        }

        return false; // Not handled, pass to LLM
    }

    async handleGreeting(username) {
        await this.agent.social._speak(`Hello ${username}! I am online and guarding.`);
    }

    async handleStatus(username) {
        const bot = this.agent.bot;
        const hp = Math.round(bot.health);
        const food = Math.round(bot.food);
        const task = this.agent.scheduler?.currentTask?.name || 'Idle';
        await this.agent.social._speak(`HP: ${hp}/20 | Food: ${food}/20 | Task: ${task}`);
    }

    async handleFollow(username) {
        await this.agent.social._speak(`Roger that. Following ${username}.`);
        // Trigger Follow Task via SignalBus or Direct Call
        // Used to be done via HumanManager, now via SignalBus event or command injection
        // Let's inject a high priority goal
        this.agent.scheduler.schedule('follow_player', 90, async (checkInterrupt) => {
            if (this.agent.skills?.goToPlayer) {
                await this.agent.skills.goToPlayer(this.agent.bot, username, 2);
            }
        });
    }

    async handleStop(username) {
        await this.agent.social._speak(`Stopping all actions.`);
        this.agent.scheduler.stopAll();
    }

    async handleReport(username) {
        const pos = this.agent.bot.entity.position;
        const x = Math.floor(pos.x);
        const y = Math.floor(pos.y);
        const z = Math.floor(pos.z);
        const biome = this.agent.bot.game.biome.name || 'Unknown';
        await this.agent.social._speak(`Position: ${x}, ${y}, ${z} | Biome: ${biome}`);
    }
}
