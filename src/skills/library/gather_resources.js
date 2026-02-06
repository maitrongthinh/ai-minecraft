/**
 * MCP-Compliant Skill: Gather Resources
 * 
 * @skill gather_resources
 * @description Gathers a specified resource (wood, stone, food, etc.) from the environment
 * @tags [survival, gathering, resource]
 * @version 1.0.0
 * @author EvolutionEngine
 */

// MCP Schema
export const metadata = {
    name: 'gather_resources',
    description: 'Gathers a specified resource from the environment',
    parameters: {
        type: 'object',
        properties: {
            resource: {
                type: 'string',
                enum: ['wood', 'stone', 'food', 'sand', 'dirt'],
                description: 'Type of resource to gather'
            },
            count: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                description: 'Number of items to gather'
            },
            maxDistance: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                default: 32,
                description: 'Maximum search distance in blocks'
            }
        },
        required: ['resource', 'count']
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            gathered: { type: 'number' },
            message: { type: 'string' },
            timeElapsed: { type: 'number' }
        }
    },
    tags: ['survival', 'gathering', 'resource']
};

// Execution function
export default async function execute(agent, params) {
    const { resource, count, maxDistance = 32 } = params;
    const startTime = Date.now();

    try {
        console.log(`[gather_resources] Gathering ${count}x ${resource}...`);

        // Validate bot status
        if (!agent.bot) {
            return {
                success: false,
                gathered: 0,
                message: 'Bot not initialized',
                timeElapsed: Date.now() - startTime
            };
        }

        // Map resource to block/entity type
        const resourceMap = {
            'wood': ['oak_log', 'birch_log', 'spruce_log'],
            'stone': ['stone', 'cobblestone'],
            'food': ['apple', 'bread', 'cooked_beef'],
            'sand': ['sand'],
            'dirt': ['dirt']
        };

        const targets = resourceMap[resource];
        if (!targets) {
            return {
                success: false,
                gathered: 0,
                message: `Unknown resource type: ${resource}`,
                timeElapsed: Date.now() - startTime
            };
        }

        // Find nearest block of this type
        const mcData = require('minecraft-data')(agent.bot.version);
        const blockType = mcData.blocksByName[targets[0]];

        if (!blockType) {
            return {
                success: false,
                gathered: 0,
                message: `Block type not found: ${targets[0]}`,
                timeElapsed: Date.now() - startTime
            };
        }

        // Use bot's skill system to gather
        let gathered = 0;
        for (let i = 0; i < count; i++) {
            const block = agent.bot.findBlock({
                matching: blockType.id,
                maxDistance: maxDistance
            });

            if (!block) {
                return {
                    success: gathered > 0,
                    gathered,
                    message: `Gathered ${gathered}/${count} (no more ${resource} found within ${maxDistance} blocks)`,
                    timeElapsed: Date.now() - startTime
                };
            }

            // Dig block
            try {
                await agent.bot.dig(block);
                gathered++;
            } catch (error) {
                return {
                    success: gathered > 0,
                    gathered,
                    message: `Gathered ${gathered}/${count} (error: ${error.message})`,
                    timeElapsed: Date.now() - startTime
                };
            }
        }

        return {
            success: true,
            gathered,
            message: `Successfully gathered ${gathered}x ${resource}`,
            timeElapsed: Date.now() - startTime
        };

    } catch (error) {
        console.error('[gather_resources] Error:', error);
        return {
            success: false,
            gathered: 0,
            message: `Error: ${error.message}`,
            timeElapsed: Date.now() - startTime
        };
    }
}
