import {
    getPosition,
    getBiomeName,
    getNearbyPlayerNames,
    getInventoryCounts,
    getNearbyEntityTypes,
    getBlockAtPosition,
    getFirstBlockAboveHead
} from "../../skills/library/world.js";

function buildInitializingState(agent) {
    return {
        name: agent?.name || 'unknown',
        gameplay: { status: 'Initializing' },
        action: {
            current: 'Loading',
            isIdle: true
        },
        surroundings: {
            below: 'unknown',
            legs: 'unknown',
            head: 'unknown',
            firstBlockAboveHead: 'unknown'
        },
        inventory: {
            counts: {},
            stacksUsed: 0,
            totalSlots: 0,
            equipment: {
                helmet: null,
                chestplate: null,
                leggings: null,
                boots: null,
                mainHand: null
            }
        },
        nearby: {
            humanPlayers: [],
            botPlayers: [],
            entityTypes: []
        },
        modes: {
            summary: 'Syncing...'
        }
    };
}

export function getFullState(agent, agents = []) {
    const bot = agent?.bot;
    if (!bot || !bot.entity || !bot.game || !bot.time || !bot.inventory) {
        return buildInitializingState(agent);
    }

    const pos = getPosition(bot);
    const position = {
        x: Number(pos.x.toFixed(2)),
        y: Number(pos.y.toFixed(2)),
        z: Number(pos.z.toFixed(2))
    };

    let weather = 'Clear';
    if (bot.thunderState > 0) weather = 'Thunderstorm';
    else if (bot.rainState > 0) weather = 'Rain';

    let timeLabel = 'Night';
    if (bot.time.timeOfDay < 6000) timeLabel = 'Morning';
    else if (bot.time.timeOfDay < 12000) timeLabel = 'Afternoon';

    const below = getBlockAtPosition(bot, 0, -1, 0).name;
    const legs = getBlockAtPosition(bot, 0, 0, 0).name;
    const head = getBlockAtPosition(bot, 0, 1, 0).name;

    let players = getNearbyPlayerNames(bot);
    const bots = agents
        .filter(a => a?.in_game)
        .map(a => a.name)
        .filter(name => name && name !== agent.name);
    players = players.filter(p => !bots.includes(p));

    const helmet = bot.inventory.slots[5];
    const chestplate = bot.inventory.slots[6];
    const leggings = bot.inventory.slots[7];
    const boots = bot.inventory.slots[8];

    return {
        name: agent.name,
        gameplay: {
            position,
            dimension: bot.game.dimension,
            gamemode: bot.game.gameMode,
            health: Math.round(bot.health),
            hunger: Math.round(bot.food),
            biome: getBiomeName(bot),
            weather,
            timeOfDay: bot.time.timeOfDay,
            timeLabel
        },
        action: {
            current: agent.isIdle() ? 'Idle' : (agent.actions ? agent.actions.currentActionLabel : 'Loading'),
            isIdle: agent.isIdle()
        },
        surroundings: {
            below,
            legs,
            head,
            firstBlockAboveHead: getFirstBlockAboveHead(bot, null, 32)
        },
        inventory: {
            counts: getInventoryCounts(bot),
            stacksUsed: bot.inventory.items().length,
            totalSlots: bot.inventory.slots.length,
            equipment: {
                helmet: helmet ? helmet.name : null,
                chestplate: chestplate ? chestplate.name : null,
                leggings: leggings ? leggings.name : null,
                boots: boots ? boots.name : null,
                mainHand: bot.heldItem ? bot.heldItem.name : null
            }
        },
        nearby: {
            humanPlayers: players,
            botPlayers: bots,
            entityTypes: getNearbyEntityTypes(bot).filter(t => t !== 'player' && t !== 'item')
        },
        modes: {
            summary: bot.modes ? bot.modes.getMiniDocs() : 'Syncing...'
        }
    };
}
