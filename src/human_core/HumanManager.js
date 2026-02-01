
import { Movements } from 'mineflayer-pathfinder';

export class HumanManager {
    constructor(agent) {
        this.agent = agent;
        this.bot = agent.bot;
        this.active = true;
        this.init();
    }

    init() {
        // Hunger Instinct
        this.bot.on('health', () => {
            if (this.bot.food < 14) {
                this.findFood();
            }
            if (this.bot.health < 10) {
                this.flee(); // Instinctive reaction to pain
            }
        });

        console.log('[HumanManager] Instincts initialized.');
    }

    async findFood() {
        if (!this.active) return;
        // mineflayer-auto-eat handles eating if food is in inventory.
        // If not, we might need to look for it.
        // For now, trigger auto-eat's built-in logic.

        // If autoEat plugin is loaded
        if (this.bot.autoEat) {
            try {
                await this.bot.autoEat.eat();
            } catch (e) {
                // Ignore errors (no food etc)
            }
        }
    }

    async flee() {
        if (!this.active) return;

        const nearestEntity = this.bot.nearestEntity(e => e.type === 'mob' || e.type === 'player');
        if (nearestEntity && nearestEntity.position.distanceTo(this.bot.entity.position) < 8) {
            console.log('[HumanManager] Fleeing danger!');
            const defaultMove = new Movements(this.bot);

            // Simple flee: move away from target
            const p = this.bot.entity.position;
            const t = nearestEntity.position;
            const heading = { x: p.x - t.x, z: p.z - t.z }; // Vector away

            // Normalize and scale
            const len = Math.sqrt(heading.x * heading.x + heading.z * heading.z);
            if (len > 0) {
                const goalX = p.x + (heading.x / len) * 16;
                const goalZ = p.z + (heading.z / len) * 16;

                try {
                    const { GoalNear } = await import('mineflayer-pathfinder').then(m => m.goals);
                    this.bot.pathfinder.setGoal(new GoalNear(goalX, p.y, goalZ, 2));
                } catch (e) {
                    console.error('[HumanManager] Failed to flee:', e);
                }
            }
        }
    }

    async sortInventory() {
        // TODO: Implement inventory sorting logic
        // This is a lower priority instinct.
    }
}
