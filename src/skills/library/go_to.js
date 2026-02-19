import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import { localLog, isModeOn, pauseMode, startDoorInterval } from './MovementUtils.js';

export const metadata = {
    name: 'go_to',
    description: 'Universal movement skill to go to coordinates, blocks, or entities.',
    parameters: {
        type: 'object',
        properties: {
            x: { type: 'number', description: 'Target X coordinate' },
            y: { type: 'number', description: 'Target Y coordinate' },
            z: { type: 'number', description: 'Target Z coordinate' },
            entityName: { type: 'string', description: 'Name of entity to go to (e.g. pig, zombie)' },
            blockType: { type: 'string', description: 'Name of block to go to (e.g. crafting_table)' },
            min_distance: { type: 'number', default: 2, description: 'Distance to stop from target' }
        }
    },
    tags: ['movement', 'navigation']
};

export default async function execute(agent, params = {}) {
    const { x, y, z, entityName, blockType, min_distance = 2 } = params;
    const bot = agent.bot || agent;

    if (x != null && y != null && z != null) {
        return await goToPosition(bot, x, y, z, min_distance);
    } else if (entityName) {
        return await goToNearestEntity(bot, entityName, min_distance);
    } else if (blockType) {
        return await goToNearestBlock(bot, blockType, min_distance);
    }

    return { success: false, message: 'Missing target parameters (x,y,z OR entityName OR blockType)' };
}


// ── Exported Functions for Re-use ──

export async function goToGoal(bot, goal) {
    const nonDestructiveMovements = new pf.Movements(bot);
    const dontBreakBlocks = ['glass', 'glass_pane'];
    for (let block of dontBreakBlocks) {
        nonDestructiveMovements.blocksCantBreak.add(mc.getBlockId(block));
    }
    nonDestructiveMovements.placeCost = 2;
    nonDestructiveMovements.digCost = 10;

    const destructiveMovements = new pf.Movements(bot);

    let final_movements = destructiveMovements;

    const pathfind_timeout = 4500;
    const isUsableStatus = (status) => status === 'success' || status === 'partial';
    const nonDestructiveProbe = await bot.pathfinder.getPathTo(nonDestructiveMovements, goal, pathfind_timeout);
    if (isUsableStatus(nonDestructiveProbe.status)) {
        final_movements = nonDestructiveMovements;
        localLog(bot, `Found non-destructive path.`);
    }
    else {
        const destructiveProbe = await bot.pathfinder.getPathTo(destructiveMovements, goal, pathfind_timeout);
        if (isUsableStatus(destructiveProbe.status)) {
            localLog(bot, `Found destructive path.`);
        }
        else {
            localLog(bot, `Path not found, but attempting to navigate anyway using destructive movements.`);
        }
    }

    const doorCheckInterval = startDoorInterval(bot);

    bot.pathfinder.setMovements(final_movements);
    const pathTimeoutMs = 32000;
    try {
        await Promise.race([
            bot.pathfinder.goto(goal),
            new Promise((_, reject) =>
                setTimeout(() => {
                    bot.pathfinder.stop();
                    reject(new Error(`Pathfinder timeout after ${pathTimeoutMs}ms`));
                }, pathTimeoutMs)
            )
        ]);
        clearInterval(doorCheckInterval);
        return true;
    } catch (err) {
        clearInterval(doorCheckInterval);
        throw err;
    }
}

export async function goToPosition(bot, x, y, z, min_distance = 2) {
    if (x == null || y == null || z == null) {
        localLog(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }
    if (isModeOn(bot, 'cheat')) {
        bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
        localLog(bot, `Teleported to ${x}, ${y}, ${z}.`);
        return true;
    }

    try {
        await goToGoal(bot, new pf.goals.GoalNear(x, y, z, min_distance));
        const distance = bot.entity.position.distanceTo(new Vec3(x, y, z));
        if (distance <= min_distance + 1.5) { // Slightly increased tolerance
            localLog(bot, `You have reached at ${x}, ${y}, ${z}.`);
            return true;
        }
        else {
            localLog(bot, `Unable to reach ${x}, ${y}, ${z}, you are ${Math.round(distance)} blocks away.`);
            return false;
        }
    } catch (err) {
        localLog(bot, `Pathfinding stopped: ${err.message}.`);
        return false;
    }
}

export async function goToNearestBlock(bot, blockType, min_distance = 2, range = 64) {
    const MAX_RANGE = 512;
    if (range > MAX_RANGE) {
        localLog(bot, `Maximum search range capped at ${MAX_RANGE}. `);
        range = MAX_RANGE;
    }
    let block = null;
    if (blockType === 'water' || blockType === 'lava') {
        let blocks = world.getNearestBlocksWhere(bot, block => block.name === blockType && block.metadata === 0, range, 1);
        if (blocks.length === 0) {
            localLog(bot, `Could not find any source ${blockType} in ${range} blocks, looking for uncollectable flowing instead...`);
            blocks = world.getNearestBlocksWhere(bot, block => block.name === blockType, range, 1);
        }
        block = blocks[0];
    }
    else {
        block = world.getNearestBlock(bot, blockType, range);
    }
    if (!block) {
        localLog(bot, `Could not find any ${blockType} in ${range} blocks.`);
        return false;
    }
    localLog(bot, `Found ${blockType} at ${block.position}. Navigating...`);
    return await goToPosition(bot, block.position.x, block.position.y, block.position.z, min_distance);
}

export async function goToNearestEntity(bot, entityType, min_distance = 2, range = 64) {
    let entity = world.getNearestEntityWhere(bot, entity => entity.name === entityType, range);
    if (!entity) {
        localLog(bot, `Could not find any ${entityType} in ${range} blocks.`);
        return false;
    }
    let distance = bot.entity.position.distanceTo(entity.position);
    localLog(bot, `Found ${entityType} ${distance} blocks away.`);
    return await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, min_distance);
}

export async function goToBed(bot) {
    const beds = bot.findBlocks({
        matching: (block) => {
            return block.name.includes('bed');
        },
        maxDistance: 32,
        count: 1
    });
    if (beds.length === 0) {
        localLog(bot, `Could not find a bed to sleep in.`);
        return false;
    }
    let loc = beds[0];
    await goToPosition(bot, loc.x, loc.y, loc.z);
    const bed = bot.blockAt(loc);
    await bot.sleep(bed);
    localLog(bot, `You are in bed.`);
    pauseMode(bot, 'unstuck');
    while (bot.isSleeping) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    localLog(bot, `You have woken up.`);
    return true;
}

export async function goToSurface(bot) {
    const pos = bot.entity.position;
    for (let y = 360; y > -64; y--) {
        const block = bot.blockAt(new Vec3(pos.x, y, pos.z));
        if (!block || block.name === 'air' || block.name === 'cave_air') {
            continue;
        }
        await goToPosition(bot, block.position.x, block.position.y + 1, block.position.z, 0);
        localLog(bot, `Going to the surface at y=${y + 1}.`);
        return true;
    }
    return false;
}
