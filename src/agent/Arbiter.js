
export class Arbiter {
    constructor(agent) {
        this.agent = agent;
        this.is_survival_mode = false;
        this.init();
    }

    init() {
        this.agent.bot.on('physicsTick', () => this.update());
        this.agent.bot.on('idle', () => this.onIdle());
    }

    setSurvivalMode(enabled) {
        this.is_survival_mode = enabled;
        console.log(`[Arbiter] Survival Mode: ${enabled ? 'ON' : 'OFF'}`);
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
