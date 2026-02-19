import minecraftData from 'minecraft-data';
import { RetryHelper } from '../../utils/RetryHelper.js';
import { checkInventorySpace } from '../../utils/mcdata.js';
import { goToPosition } from './go_to.js';

/**
 * MCP-Compliant Skill: Mine Ores
 * 
 * @skill mine_ores
 * @description Finds and mines specified ore types
 * @tags [mining, ores, survival]
 * @version 1.0.0
 */

export const metadata = {
    name: 'mine_ores',
    description: 'Finds and mines ore blocks',
    parameters: {
        type: 'object',
        properties: {
            oreType: {
                type: 'string',
                enum: ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore'],
                description: 'Type of ore to mine'
            },
            count: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                default: 8,
                description: 'Number of ore blocks to mine'
            },
            maxDistance: {
                type: 'number',
                minimum: 1,
                maximum: 128,
                default: 64,
                description: 'Maximum search distance'
            }
        },
        required: ['oreType']
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            mined: { type: 'number' },
            collected: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' }
        }
    },
    tags: ['mining', 'ores', 'survival']
};

export default async function execute(agent, params = {}) {
    const { oreType, count = 8, maxDistance = 64 } = params;
    const bot = agent?.bot || agent;

    try {
        if (bot) checkInventorySpace(bot);
        console.log(`[mine_ores] Mining ${count}x ${oreType}...`);

        if (!bot) {
            return {
                success: false,
                mined: 0,
                collected: [],
                message: 'Bot not initialized'
            };
        }

        const mcData = minecraftData(bot.version);
        const oreBlock = mcData.blocksByName[oreType];

        if (!oreBlock) {
            return {
                success: false,
                mined: 0,
                collected: [],
                message: `Unknown ore type: ${oreType}`
            };
        }

        const withTimeout = (promise, timeoutMs, label) => Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
        ]);

        const mineTargetOre = async (targetPos) => {
            const latest = bot.blockAt(targetPos);
            if (!latest || latest.type !== oreBlock.id) {
                throw new Error(`Target ${oreType} block disappeared`);
            }

            const distance = bot.entity.position.distanceTo(latest.position);
            if (distance > 4.5) {
                const moved = await withTimeout(
                    goToPosition(bot, latest.position.x, latest.position.y, latest.position.z, 2),
                    15000,
                    'goToPosition'
                );
                if (!moved) {
                    throw new Error(`Cannot reach ${oreType} at ${latest.position.x},${latest.position.y},${latest.position.z}`);
                }
            }

            await withTimeout(bot.dig(latest, true), 12000, 'dig');
        };

        let mined = 0;
        const collected = [];

        for (let i = 0; i < count; i++) {
            const ore = bot.findBlock({
                matching: oreBlock.id,
                maxDistance: maxDistance
            });

            if (!ore) {
                return {
                    success: mined > 0,
                    mined,
                    collected,
                    message: `Mined ${mined}/${count} (no more ${oreType} found)`
                };
            }

            try {
                // Count items before digging
                const beforeCount = bot.inventory.items().length;

                if (agent?.actionAPI) {
                    const minedResult = await agent.actionAPI.mine(ore, {
                        retries: 2,
                        baseDelay: 250,
                        executor: async () => mineTargetOre(ore.position)
                    });
                    if (!minedResult.success) {
                        throw new Error(minedResult.error || 'mine failed');
                    }
                } else {
                    await RetryHelper.retry(
                        async () => mineTargetOre(ore.position),
                        {
                            context: `mine_ores:${oreType}`,
                            maxRetries: 2,
                            baseDelay: 250,
                            maxDelay: 800
                        }
                    );
                }
                mined++;

                // Check what we collected
                const afterCount = bot.inventory.items().length;
                if (afterCount > beforeCount) {
                    const newItems = bot.inventory.items().slice(beforeCount);
                    collected.push(...newItems.map(item => item.name));
                }
            } catch (error) {
                return {
                    success: mined > 0,
                    mined,
                    collected,
                    message: `Mined ${mined}/${count} (error: ${error.message})`
                };
            }
        }

        return {
            success: true,
            mined,
            collected,
            message: `Successfully mined ${mined}x ${oreType}`
        };

    } catch (error) {
        console.error('[mine_ores] Error:', error);
        return {
            success: false,
            mined: 0,
            collected: [],
            message: `Error: ${error.message}`
        };
    }
}
