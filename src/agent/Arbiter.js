import settings from '../../settings.js';

export class Arbiter {
    constructor(agent) {
        this.agent = agent;
        this.is_survival_mode = false;

        // Safety Constants (Externalized to settings.js)
        this.CRITICAL_HEALTH = settings.critical_health || 8;
        this.CRITICAL_FOOD = settings.critical_food || 6;

        // Allowed commands during emergencies
        this.SAFE_COMMANDS = ['eat', 'equip', 'hide', 'sleep', 'retreat', 'come', 'help'];
        this.FOOD_COMMANDS = ['eat', 'fish', 'hunt', 'harvest', 'cook', 'find_food'];
    }

    bindBot(bot) {
        if (!bot) return;
        this.agent.bot = bot; // Ensure sync

        bot.on('health', () => {
            this.checkSurvival();
        });
    }

    checkSurvival() {
        if (!this.agent.bot) return;

        const health = this.agent.bot.health;
        const food = this.agent.bot.food;

        if (health <= this.CRITICAL_HEALTH || food <= this.CRITICAL_FOOD) {
            if (!this.is_survival_mode) {
                console.warn(`[Arbiter] 🚨 SURVIVAL MODE ACTIVATED (Health: ${health}, Food: ${food})`);
                this.is_survival_mode = true;
                this.agent.stateStack.push('Survival', { reason: 'critical_needs', priority: 'high' });
            }
        } else {
            if (this.is_survival_mode) {
                console.log(`[Arbiter] ✅ Survival needs met. Returning to normal.`);
                this.is_survival_mode = false;
            }
        }
    }

    isSafe(commandLabel) {
        if (!this.is_survival_mode) return true;

        // During survival mode, only allow safe commands or food-related commands
        const cmd = commandLabel.toLowerCase();
        return this.SAFE_COMMANDS.includes(cmd) || this.FOOD_COMMANDS.includes(cmd);
    }
}
export default Arbiter;
