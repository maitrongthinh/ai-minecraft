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

export default async function execute(agent, params) {
    const { oreType, count = 8, maxDistance = 64 } = params;

    try {
        console.log(`[mine_ores] Mining ${count}x ${oreType}...`);

        if (!agent.bot) {
            return {
                success: false,
                mined: 0,
                collected: [],
                message: 'Bot not initialized'
            };
        }

        const mcData = require('minecraft-data')(agent.bot.version);
        const oreBlock = mcData.blocksByName[oreType];

        if (!oreBlock) {
            return {
                success: false,
                mined: 0,
                collected: [],
                message: `Unknown ore type: ${oreType}`
            };
        }

        let mined = 0;
        const collected = [];

        for (let i = 0; i < count; i++) {
            const ore = agent.bot.findBlock({
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
                const beforeCount = agent.bot.inventory.items().length;

                await agent.bot.dig(ore);
                mined++;

                // Check what we collected
                const afterCount = agent.bot.inventory.items().length;
                if (afterCount > beforeCount) {
                    const newItems = agent.bot.inventory.items().slice(beforeCount);
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
