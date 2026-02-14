import { getStoryMilestones } from './milestones/story.js';
import { getNetherMilestones } from './milestones/nether.js';
import { getEndMilestones } from './milestones/end.js';
import { getAdventureMilestones } from './milestones/adventure.js';
import { getHusbandryMilestones } from './milestones/husbandry.js';

export class AdvancementLadder {
    constructor(agent) {
        this.agent = agent;
        this.milestones = this._buildMilestones();
    }

    _countItem(nameOrPredicate) {
        const bot = this.agent?.bot;
        if (!bot?.inventory?.items) return 0;
        const items = bot.inventory.items();
        const predicate = typeof nameOrPredicate === 'function'
            ? nameOrPredicate
            : (item) => item.name === nameOrPredicate;

        return items.filter(predicate).reduce((sum, item) => sum + (item.count || 0), 0);
    }

    _hasAny(names = []) {
        return names.some(name => this._countItem(name) > 0);
    }

    _buildMilestones() {
        let milestones = [];

        // Load from modules
        const sections = [
            getStoryMilestones,
            getNetherMilestones,
            getEndMilestones,
            getAdventureMilestones,
            getHusbandryMilestones
        ];

        for (const loader of sections) {
            try {
                const ms = loader(this);
                if (Array.isArray(ms)) {
                    milestones.push(...ms);
                }
            } catch (e) {
                console.error(`[AdvancementLadder] Error loading section: ${e.message}`);
            }
        }

        return milestones;
    }

    listMilestones() {
        return this.milestones;
    }

    getMilestone(id) {
        return this.milestones.find(m => m.id === id) || null;
    }

    evaluate(completedMilestones = []) {
        const completedSet = new Set(completedMilestones || []);
        const newlyCompleted = [];

        for (const milestone of this.milestones) {
            if (completedSet.has(milestone.id)) continue;

            const prerequisitesMet = milestone.prerequisites.every(req => completedSet.has(req));
            if (!prerequisitesMet) continue;

            let completed = false;
            try {
                completed = Boolean(milestone.detector());
            } catch {
                completed = false;
            }

            if (completed) {
                newlyCompleted.push(milestone.id);
                completedSet.add(milestone.id);
            }
        }

        return {
            newlyCompleted,
            allCompleted: Array.from(completedSet)
        };
    }

    getNextMilestone(completedMilestones = []) {
        const completedSet = new Set(completedMilestones || []);

        for (const milestone of this.milestones) {
            if (completedSet.has(milestone.id)) continue;
            const prerequisitesMet = milestone.prerequisites.every(req => completedSet.has(req));
            if (!prerequisitesMet) continue;
            return milestone;
        }

        return null;
    }
}

export default AdvancementLadder;
