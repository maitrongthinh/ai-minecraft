import { localLog } from './MovementUtils.js';
import { goToPosition } from './go_to.js';

export const metadata = {
    name: 'explore',
    description: 'Wanders to a random nearby position to explore.',
    parameters: {
        type: 'object',
        properties: {
            distance: { type: 'number', default: 32, description: 'Max distance to wander' }
        }
    },
    tags: ['movement', 'exploration']
};

export default async function execute(agent, params = {}) {
    const { distance = 32 } = params;
    const bot = agent.bot || agent;

    if (!bot.entity || !bot.entity.position) {
        return { success: false, message: 'Bot has no position' };
    }

    // Random angle
    const angle = Math.random() * Math.PI * 2;
    // Random distance between distance/2 and distance
    const dist = (Math.random() * (distance / 2)) + (distance / 2);

    const dx = Math.cos(angle) * dist;
    const dz = Math.sin(angle) * dist;

    const targetX = bot.entity.position.x + dx;
    const targetZ = bot.entity.position.z + dz;
    const targetY = bot.entity.position.y; // Keep Y same initially, pathfinder handles elevation

    localLog(bot, `Exploring to offset (${Math.floor(dx)}, ${Math.floor(dz)})...`);

    // Use goToPosition from go_to.js
    const success = await goToPosition(bot, targetX, targetY, targetZ, 2);

    return {
        success,
        message: success ? `Explored to (${Math.floor(targetX)}, ${Math.floor(targetY)}, ${Math.floor(targetZ)})` : 'Failed to reach exploration target'
    };
}
