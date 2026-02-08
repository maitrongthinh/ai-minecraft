import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import { log } from "./util.js"; // Need a util file to avoid circular dep on log if it was in interaction
import { StrategicMovement } from "./StrategicMovement.js";

// Define log locally if not in util to avoid deps
// export function log(bot, message) {
//    bot.output += message + '\n';
// }
// Actually, let's create a shared utils/log or just duplicated it. Code duplication is lesser evil than circular dep for now.
// But wait, skills.js had a helper log.
function localLog(bot, message) {
    bot.output += message + '\n';
}

let _doorInterval = null;
function startDoorInterval(bot) {
    if (_doorInterval) {
        clearInterval(_doorInterval);
    }
    let prev_pos = bot.entity.position.clone();
    let prev_check = Date.now();
    let stuck_time = 0;

    const doorCheckInterval = setInterval(() => {
        const now = Date.now();
        if (bot.entity.position.distanceTo(prev_pos) >= 0.1) {
            stuck_time = 0;
        } else {
            stuck_time += now - prev_check;
        }

        if (stuck_time > 1200) {
            const positions = [
                bot.entity.position.clone(),
                bot.entity.position.offset(0, 0, 1),
                bot.entity.position.offset(0, 0, -1),
                bot.entity.position.offset(1, 0, 0),
                bot.entity.position.offset(-1, 0, 0),
            ]
            let elevated_positions = positions.map(position => position.offset(0, 1, 0));
            positions.push(...elevated_positions);
            positions.push(bot.entity.position.offset(0, 2, 0));
            positions.push(bot.entity.position.offset(0, -1, 0));

            let currentIndex = positions.length;
            while (currentIndex != 0) {
                let randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [positions[currentIndex], positions[randomIndex]] = [
                    positions[randomIndex], positions[currentIndex]];
            }

            for (let position of positions) {
                let block = bot.blockAt(position);
                if (block && block.name &&
                    !block.name.includes('iron') &&
                    (block.name.includes('door') ||
                        block.name.includes('fence_gate') ||
                        block.name.includes('trapdoor'))) {
                    bot.activateBlock(block);
                    break;
                }
            }
            stuck_time = 0;
        }
        prev_pos = bot.entity.position.clone();
        prev_check = now;
    }, 200);
    _doorInterval = doorCheckInterval;
    return doorCheckInterval;
}

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

    const pathfind_timeout = 1000;
    if (await bot.pathfinder.getPathTo(nonDestructiveMovements, goal, pathfind_timeout).status === 'success') {
        final_movements = nonDestructiveMovements;
        localLog(bot, `Found non-destructive path.`);
    }
    else if (await bot.pathfinder.getPathTo(destructiveMovements, goal, pathfind_timeout).status === 'success') {
        localLog(bot, `Found destructive path.`);
    }
    else {
        localLog(bot, `Path not found, but attempting to navigate anyway using destructive movements.`);
    }

    const doorCheckInterval = startDoorInterval(bot);

    bot.pathfinder.setMovements(final_movements);
    try {
        await bot.pathfinder.goto(goal);
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
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
        localLog(bot, `Teleported to ${x}, ${y}, ${z}.`);
        return true;
    }

    // Stub checkDigProgress logic or implement if needed
    // The original code had a checkDigProgress interval.
    // Simplifying for now or we can include it.

    try {
        await goToGoal(bot, new pf.goals.GoalNear(x, y, z, min_distance));
        const distance = bot.entity.position.distanceTo(new Vec3(x, y, z));
        if (distance <= min_distance + 1) {
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
    await goToPosition(bot, block.position.x, block.position.y, block.position.z, min_distance);
    return true;
}

export async function goToNearestEntity(bot, entityType, min_distance = 2, range = 64) {
    let entity = world.getNearestEntityWhere(bot, entity => entity.name === entityType, range);
    if (!entity) {
        localLog(bot, `Could not find any ${entityType} in ${range} blocks.`);
        return false;
    }
    let distance = bot.entity.position.distanceTo(entity.position);
    localLog(bot, `Found ${entityType} ${distance} blocks away.`);
    await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, min_distance);
    return true;
}

export async function goToPlayer(bot, username, distance = 3) {
    if (bot.username === username) {
        localLog(bot, `You are already at ${username}.`);
        return true;
    }
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + username);
        localLog(bot, `Teleported to ${username}.`);
        return true;
    }

    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    let player = bot.players[username]?.entity;
    if (!player) {
        localLog(bot, `Could not find ${username}.`);
        return false;
    }

    distance = Math.max(distance, 0.5);
    const goal = new pf.goals.GoalFollow(player, distance);

    await goToGoal(bot, goal);

    localLog(bot, `You have reached ${username}.`);
}

export async function followPlayer(bot, username, distance = 4) {
    let player = bot.players[username]?.entity;
    if (!player) return false;

    const move = new pf.Movements(bot);
    move.digCost = 10;
    bot.pathfinder.setMovements(move);
    let doorCheckInterval = startDoorInterval(bot);

    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);
    localLog(bot, `You are now actively following player ${username}.`);

    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const distance_from_player = bot.entity.position.distanceTo(player.position);

        const teleport_distance = 100;
        const ignore_modes_distance = 30;
        const nearby_distance = distance + 2;

        if (distance_from_player > teleport_distance && bot.modes.isOn('cheat')) {
            await goToPlayer(bot, username);
        }
        else if (distance_from_player > ignore_modes_distance) {
            bot.modes.pause('item_collecting');
            bot.modes.pause('hunting');
            bot.modes.pause('torch_placing');
        }
        else if (distance_from_player <= ignore_modes_distance) {
            bot.modes.unpause('item_collecting');
            bot.modes.unpause('hunting');
            bot.modes.unpause('torch_placing');
        }

        if (distance_from_player <= nearby_distance) {
            if (doorCheckInterval) { clearInterval(doorCheckInterval); doorCheckInterval = null; }
            bot.modes.pause('unstuck');
            bot.modes.pause('elbow_room');
        }
        else {
            if (!doorCheckInterval) {
                doorCheckInterval = startDoorInterval(bot);
            }
            bot.modes.unpause('unstuck');
            bot.modes.unpause('elbow_room');
        }
    }
    if (doorCheckInterval) clearInterval(doorCheckInterval);
    return true;
}

export async function moveAway(bot, distance) {
    const pos = bot.entity.position;

    // Use StrategicMovement for safe vector calculation
    const safePos = StrategicMovement.findSafeRetreatPos(bot, pos, distance);

    if (safePos) {
        log(bot, `Retreating to safe position: ${safePos.floored()}`);
        if (bot.modes.isOn('cheat')) {
            bot.chat('/tp @s ' + safePos.x + ' ' + safePos.y + ' ' + safePos.z);
            return true;
        }

        await goToGoal(bot, new pf.goals.GoalNear(safePos.x, safePos.y, safePos.z, 1));
        let new_pos = bot.entity.position;
        localLog(bot, `Moved away from ${pos.floored()} to ${new_pos.floored()}.`);
        return true;
    }

    // Fallback if no safe position found (unlikely unless completely surrounded)
    localLog(bot, `Could not find safe retreat position. Attempting fallback...`);
    let goal = new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance);
    let inverted_goal = new pf.goals.GoalInvert(goal);
    bot.pathfinder.setMovements(new pf.Movements(bot));

    // ... (rest of fallback logic) ...
    await goToGoal(bot, inverted_goal);
    let new_pos = bot.entity.position;
    localLog(bot, `Moved away (blindly) from ${pos.floored()} to ${new_pos.floored()}.`);
    return true;
}

export async function moveAwayFromEntity(bot, entity, distance = 16) {
    let goal = new pf.goals.GoalFollow(entity, distance);
    let inverted_goal = new pf.goals.GoalInvert(goal);
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(inverted_goal);
    return true;
}

// avoidEnemies moved to combat_skills.js to avoid circular dependency

export async function stay(bot, seconds = 30) {
    bot.modes.pause('self_preservation');
    bot.modes.pause('unstuck');
    bot.modes.pause('cowardice');
    bot.modes.pause('self_defense');
    bot.modes.pause('hunting');
    bot.modes.pause('torch_placing');
    bot.modes.pause('item_collecting');
    let start = Date.now();
    while (!bot.interrupt_code && (seconds === -1 || Date.now() - start < seconds * 1000)) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    localLog(bot, `Stayed for ${(Date.now() - start) / 1000} seconds.`);
    return true;
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
    bot.modes.pause('unstuck');
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
