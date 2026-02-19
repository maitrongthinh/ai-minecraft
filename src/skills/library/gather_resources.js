import minecraftData from 'minecraft-data';
import { RetryHelper } from '../../utils/RetryHelper.js';
import { goToPosition } from './go_to.js';

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
                enum: [
                    'wood', 'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
                    'mangrove_log', 'cherry_log', 'stone', 'food', 'sand', 'dirt'
                ],
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
export default async function execute(agent, params = {}) {
    const { resource, count, maxDistance = 32 } = params;
    const startTime = Date.now();
    const bot = agent?.bot || agent;

    try {
        const normalizedResource = String(resource || 'wood').trim().toLowerCase();
        const safeCount = Math.max(1, Math.min(Number.isFinite(count) ? Number(count) : 8, 64));
        console.log(`[gather_resources] Gathering ${safeCount}x ${normalizedResource || 'wood'}...`);

        // Validate bot status
        if (!bot) {
            return {
                success: false,
                gathered: 0,
                message: 'Bot not initialized',
                timeElapsed: Date.now() - startTime
            };
        }

        // Map resource to block/entity type
        const resourceMap = {
            'wood': [
                'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log',
                'dark_oak_log', 'mangrove_log', 'cherry_log'
            ],
            'stone': ['stone', 'cobblestone'],
            'food': ['apple', 'bread', 'cooked_beef'],
            'sand': ['sand'],
            'dirt': ['dirt']
        };

        const woodAliases = new Set([
            'log', 'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log',
            'dark_oak_log', 'mangrove_log', 'cherry_log'
        ]);
        const resolvedResource = woodAliases.has(normalizedResource)
            ? 'wood'
            : (resourceMap[normalizedResource] ? normalizedResource : 'wood');

        const targets = [...(resourceMap[resolvedResource] || resourceMap.wood)];
        if (woodAliases.has(normalizedResource) && normalizedResource !== 'log') {
            targets.unshift(normalizedResource);
        }

        if (!targets) {
            return {
                success: false,
                gathered: 0,
                message: `Unknown resource type: ${normalizedResource}`,
                timeElapsed: Date.now() - startTime
            };
        }

        // Find nearest block of this type
        const mcData = minecraftData(bot.version);
        const blockTypeIds = targets
            .map(name => mcData.blocksByName[name]?.id)
            .filter(id => typeof id === 'number');
        if (blockTypeIds.length === 0) {
            return {
                success: false,
                gathered: 0,
                message: `Block type not found: ${targets[0]}`,
                timeElapsed: Date.now() - startTime
            };
        }

        const withTimeout = (promise, timeoutMs, label) => Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
        ]);

        const mineTargetBlock = async (targetPos) => {
            const latest = bot.blockAt(targetPos);
            if (!latest || !blockTypeIds.includes(latest.type)) {
                throw new Error(`Target ${resolvedResource} block disappeared`);
            }

            const distance = bot.entity.position.distanceTo(latest.position);
            if (distance > 4.5) {
                const moved = await withTimeout(
                    goToPosition(bot, latest.position.x, latest.position.y, latest.position.z, 2),
                    12000,
                    'goToPosition'
                );
                if (!moved) {
                    throw new Error(`Cannot reach ${resolvedResource} at ${latest.position.x},${latest.position.y},${latest.position.z}`);
                }
            }

            await withTimeout(bot.dig(latest, true), 10000, 'dig');
        };

        // Use bot's skill system to gather
        let gathered = 0;
        for (let i = 0; i < safeCount; i++) {
            const block = bot.findBlock({
                matching: (candidate) => candidate && blockTypeIds.includes(candidate.type),
                maxDistance: maxDistance
            });

            if (!block) {
                return {
                    success: gathered > 0,
                    gathered,
                    message: `Gathered ${gathered}/${safeCount} (no more ${resolvedResource} found within ${maxDistance} blocks)`,
                    timeElapsed: Date.now() - startTime
                };
            }

            // Dig block
            try {
                if (agent?.actionAPI) {
                    const mined = await agent.actionAPI.mine(block, {
                        retries: 2,
                        baseDelay: 250,
                        executor: async () => mineTargetBlock(block.position)
                    });
                    if (!mined.success) {
                        throw new Error(mined.error || 'mine failed');
                    }
                } else {
                    await RetryHelper.retry(
                        async () => mineTargetBlock(block.position),
                        {
                            context: `gather_resources:${resolvedResource}`,
                            maxRetries: 2,
                            baseDelay: 250,
                            maxDelay: 800
                        }
                    );
                }
                gathered++;
            } catch (error) {
                return {
                    success: gathered > 0,
                    gathered,
                    message: `Gathered ${gathered}/${safeCount} (error: ${error.message})`,
                    timeElapsed: Date.now() - startTime
                };
            }
        }

        return {
            success: true,
            gathered,
            message: `Successfully gathered ${gathered}x ${resolvedResource}`,
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
