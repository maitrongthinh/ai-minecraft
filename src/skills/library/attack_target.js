/**
 * MCP-Compliant Skill: Attack Target
 * 
 * @skill attack_target
 * @description Attacks a specific entity or nearest entity of a given type
 * @tags [combat, offense]
 */

export const metadata = {
    name: 'attack_target',
    description: 'Attacks a specific entity or nearest entity of a given type',
    parameters: {
        type: 'object',
        properties: {
            entityName: {
                type: 'string',
                description: 'Name of the entity to attack (e.g. zombie, skeleton)'
            },
            maxDistance: {
                type: 'number',
                default: 4,
                description: 'Maximum distance to search for target'
            }
        },
        required: ['entityName']
    },
    tags: ['combat', 'offense']
};

export default async function execute(agent, params = {}) {
    const { entityName, maxDistance = 4 } = params;
    const bot = agent.bot || agent;

    if (!entityName) {
        return { success: false, message: 'Missing entityName' };
    }

    const target = bot.nearestEntity(e => e.name === entityName && bot.entity.position.distanceTo(e.position) <= maxDistance);
    if (!target) {
        return { success: false, message: `No ${entityName} found within ${maxDistance} blocks` };
    }

    if (agent.actionAPI) {
        return await agent.actionAPI.attack({
            entity: target,
            options: { retries: 1 }
        });
    }

    // Fallback
    try {
        bot.attack(target);
        return { success: true, message: `Attacked ${entityName}` };
    } catch (err) {
        return { success: false, message: `Failed to attack: ${err.message}` };
    }
}
