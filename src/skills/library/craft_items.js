import minecraftData from 'minecraft-data';
import { RetryHelper } from '../../utils/RetryHelper.js';

/**
 * MCP-Compliant Skill: Craft Items
 * 
 * @skill craft_items
 * @description Crafts specified items using a crafting table or inventory
 * @tags [crafting, items, building]
 * @version 1.0.0
 */

export const metadata = {
    name: 'craft_items',
    description: 'Crafts items using crafting table or inventory',
    parameters: {
        type: 'object',
        properties: {
            item: {
                type: 'string',
                description: 'Item to craft (e.g., "stick", "crafting_table", "wooden_pickaxe")'
            },
            count: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                default: 1,
                description: 'Number of items to craft'
            }
        },
        required: ['item']
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            crafted: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['crafting', 'items', 'building']
};

export default async function execute(agent, params = {}) {
    const { item, count = 1 } = params;
    const bot = agent?.bot || agent;

    try {
        console.log(`[craft_items] Crafting ${count}x ${item}...`);

        if (!bot) {
            return {
                success: false,
                crafted: 0,
                message: 'Bot not initialized'
            };
        }

        const mcData = minecraftData(bot.version);
        const itemType = mcData.itemsByName[item];

        if (!itemType) {
            return {
                success: false,
                crafted: 0,
                message: `Unknown item: ${item}`
            };
        }

        if (agent?.actionAPI) {
            const result = await agent.actionAPI.craft(item, count, { retries: 2, baseDelay: 300 });
            return {
                success: result.success,
                crafted: result.success ? count : 0,
                message: result.success
                    ? `Successfully crafted ${count}x ${item}`
                    : `Craft failed: ${result.error}`
            };
        }

        const craftingTableId = mcData.blocksByName?.crafting_table?.id;
        const craftingTable = craftingTableId
            ? bot.findBlock({
                matching: craftingTableId,
                maxDistance: 32
            })
            : null;

        let crafted = 0;
        for (let i = 0; i < count; i++) {
            try {
                await RetryHelper.retry(
                    async () => {
                        const recipes = bot.recipesFor(itemType.id, null, 1, craftingTable || null);
                        if (!recipes || recipes.length === 0) {
                            throw new Error(`No recipe available for ${item}`);
                        }
                        await bot.craft(recipes[0], 1, craftingTable || null);
                    },
                    {
                        context: `craft_items:${item}`,
                        maxRetries: 2,
                        baseDelay: 300,
                        maxDelay: 1000
                    }
                );
                crafted++;
            } catch (error) {
                return {
                    success: crafted > 0,
                    crafted,
                    message: `Crafted ${crafted}/${count} (${error.message})`
                };
            }
        }

        return {
            success: true,
            crafted,
            message: `Successfully crafted ${crafted}x ${item}`
        };

    } catch (error) {
        console.error('[craft_items] Error:', error);
        return {
            success: false,
            crafted: 0,
            message: `Error: ${error.message}`
        };
    }
}
