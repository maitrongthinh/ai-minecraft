import { RetryHelper } from '../../utils/RetryHelper.js';
import { goToNearestBlock } from './go_to.js';

export const metadata = {
    name: 'find_shelter',
    description: 'Finds and moves to a basic shelter location',
    parameters: {
        type: 'object',
        properties: {
            retries: {
                type: 'number',
                minimum: 0,
                maximum: 5,
                default: 2
            }
        },
        required: []
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
        }
    },
    tags: ['survival', 'shelter']
};

export default async function find_shelter(agent, options = {}) {
    const bot = agent?.bot || agent;
    if (!bot) {
        return { success: false, message: 'Bot not initialized' };
    }

    const stateHolder = bot;
    const recent = stateHolder?._lastShelterState;
    if (recent) {
        const dx = bot.entity.position.x - recent.x;
        const dy = bot.entity.position.y - recent.y;
        const dz = bot.entity.position.z - recent.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 3 && Date.now() - recent.ts < 45000) {
            return { success: true, message: 'Already sheltered recently' };
        }
    }

    const retries = options.retries ?? 2;
    const shelterBlocks = ['cave_air', 'stone', 'dirt', 'oak_planks'];
    for (const blockName of shelterBlocks) {
        try {
            await RetryHelper.retry(
                async () => {
                    const moved = await goToNearestBlock(bot, blockName, 2, 48);
                    if (!moved) throw new Error(`No ${blockName} nearby`);

                    // Phase 13: Safety check - Ensure we didn't dive into an underwater death trap
                    const headBlock = bot.blockAt(bot.entity.position.offset(0, 1.8, 0));
                    if (headBlock && headBlock.name.includes('water')) {
                        console.warn(`[find_shelter] Destination under ${blockName} is underwater. Aborting.`);
                        throw new Error('Underwater destination');
                    }
                },
                {
                    context: `find_shelter:${blockName}`,
                    maxRetries: retries,
                    baseDelay: 250,
                    maxDelay: 1200
                }
            );
            if (stateHolder) {
                stateHolder._lastShelterState = {
                    x: bot.entity.position.x,
                    y: bot.entity.position.y,
                    z: bot.entity.position.z,
                    ts: Date.now()
                };
            }
            return { success: true, message: `Shelter found near ${blockName}` };
        } catch (err) {
            // Try next shelter block type.
        }
    }

    // Final Fallback: If no shelter found, just dig into the ground!
    console.log('[find_shelter] 🚨 No suitable shelter found. Digging emergency hole...');
    try {
        await agent.intelligence.execute(`
            await actions.eat_if_hungry({ threshold: 14 });
            const pos = bot.entity.position.floor();
            await bot.dig(bot.blockAt(pos.offset(0, -1, 0))); // Dig down 1
            await bot.dig(bot.blockAt(pos.offset(0, -2, 0))); // Dig down 2
            await bot.pathfinder.goto(new pf.goals.GoalBlock(pos.x, pos.y - 2, pos.z));
            // Place a block above head if possible
            const blockToPlace = bot.inventory.items().find(i => i.name === 'dirt' || i.name === 'cobblestone');
            if (blockToPlace) {
                await actions.place(blockToPlace.name, pos.offset(0, -1, 0));
            }
        `);
        return { success: true, message: 'Sheltered in emergency hole' };
    } catch (err) {
        return { success: false, message: 'Total failure seeking shelter: ' + err.message };
    }
}
