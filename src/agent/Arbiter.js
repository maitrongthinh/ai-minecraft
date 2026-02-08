
export class Arbiter {
    constructor(agent) {
        this.agent = agent;
        this.is_survival_mode = false;

        // Safety Constants
        this.CRITICAL_HEALTH = 8;
        this.CRITICAL_FOOD = 6;

        // Allowed commands during emergencies
        this.SAFE_COMMANDS = ['eat', 'equip', 'hide', 'sleep', 'retreat', 'come', 'help'];
        this.FOOD_COMMANDS = ['eat', 'fish', 'hunt', 'harvest', 'cook', 'find_food'];

        this.init();
    }

    init() {
        this._physicsListener = () => this.update();
        this._idleListener = () => this.onIdle();

        this.agent.bot.on('physicsTick', this._physicsListener);
        this.agent.bot.on('idle', this._idleListener);
    }

    cleanup() {
        if (!this.agent.bot) return;
        console.log('[Arbiter] 🧹 Removing event listeners...');
        if (this._physicsListener) this.agent.bot.removeListener('physicsTick', this._physicsListener);
        if (this._idleListener) this.agent.bot.removeListener('idle', this._idleListener);

        this._physicsListener = null;
        this._idleListener = null;
    }

    setSurvivalMode(enabled) {
        this.is_survival_mode = enabled;
        console.log(`[Arbiter] Survival Mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Safety Check invoked before executing any user command.
     * @param {string} commandName - The command attempting to execute
     * @param {string} username - The user who issued the command (optional)
     * @returns {object} { safe: boolean, reason: string }
     */
    checkSafety(commandName, username = null) {
        if (!this.agent.bot || !this.agent.bot.entity) return { safe: true };

        // Task 31: Trust System (The Soul)
        // Destructive commands require trust
        const destructiveCommands = ['drop', 'destroy', 'kill', 'attack', 'burn', 'throw'];
        if (username && destructiveCommands.some(c => commandName.includes(c))) {
            if (this.agent.humanManager && !this.agent.humanManager.isTrusted(username, 'destructive')) {
                const trustScore = this.agent.humanManager.getProfile(username)?.trustScore || 0;
                return {
                    safe: false,
                    reason: `I don't trust you enough for that action. (Trust: ${trustScore}/50)`
                };
            }
        }

        const health = this.agent.bot.health;
        const food = this.agent.bot.food;

        // 1. STARVATION PROTOCOL
        if (food < this.CRITICAL_FOOD) {
            // Allow food-related or safe commands only
            if (!this.FOOD_COMMANDS.includes(commandName) && !this.SAFE_COMMANDS.includes(commandName)) {
                return {
                    safe: false,
                    reason: `I am STARVING (${food.toFixed(0)}/20). I need to find food first.`
                };
            }
        }

        // 2. CRITICAL HEALTH PROTOCOL
        if (health < this.CRITICAL_HEALTH) {
            // Block combat/exploration
            const dangerous = ['kill', 'hunt', 'explore', 'goto', 'follow', 'guard', 'attack'];
            if (dangerous.some(d => commandName.includes(d))) {
                return {
                    safe: false,
                    reason: `My health is CRITICAL (${health.toFixed(0)}/20). Too dangerous to ${commandName}. Let me heal first.`
                };
            }
        }

        return { safe: true };
    }

    async update() {
        // High frequency loop (every tick)
        // Check critical instincts that might need immediate interruption
        // (HumanManager handles most of this event-driven, e.g., auto-eat)
    }

    async onIdle() {
        if (this.agent.actions.isBusy()) return;
        if (this.agent.convoManager && this.agent.convoManager.inConversation()) return;

        // Priority 3: Strategic Goals (NPCController)
        if (this.agent.npc.data.curr_goal || this.agent.npc.data.goals.length > 0) {
            await this.agent.npc.executeNext();
            return;
        }

        // Priority 4: Survival Mode / Maintenance
        if (this.is_survival_mode) {
            // Survival Logic
            // 1. Check Inventory for tools
            // 2. Build shelter if none
            // 3. Wander/Gather
            // For now, let's just trigger Dreamer if nothing else.
        }

        // Priority 5: Dreaming
        // Only dream if truly nothing else to do
        if (Math.random() < 0.05) { // Occasional dreaming
            await this.agent.dreamer.dream('Boredom');
        }
    }
}
