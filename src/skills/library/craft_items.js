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

export default async function execute(agent, params) {
    const { item, count = 1 } = params;

    try {
        console.log(`[craft_items] Crafting ${count}x ${item}...`);

        if (!agent.bot) {
            return {
                success: false,
                crafted: 0,
                message: 'Bot not initialized'
            };
        }

        const mcData = require('minecraft-data')(agent.bot.version);
        const itemType = mcData.itemsByName[item];

        if (!itemType) {
            return {
                success: false,
                crafted: 0,
                message: `Unknown item: ${item}`
            };
        }

        // Check if we have a crafting table nearby
        const craftingTable = agent.bot.findBlock({
            matching: mcData.blocksByName.crafting_table.id,
            maxDistance: 32
        });

        let crafted = 0;
        for (let i = 0; i < count; i++) {
            try {
                if (craftingTable) {
                    // Use crafting table
                    await agent.bot.craft(itemType, 1, craftingTable);
                } else {
                    // Use 2x2 inventory crafting
                    await agent.bot.craft(itemType, 1, null);
                }
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
