import pf from 'mineflayer-pathfinder';
import { localLog, isModeOn, pauseMode, unpauseMode, startDoorInterval } from './MovementUtils.js';
// goToPlayer is defined in this file.

export const metadata = {
    name: 'follow_player',
    description: 'Follows a specified player.',
    parameters: {
        type: 'object',
        properties: {
            username: { type: 'string', description: 'Name of the player to follow' },
            distance: { type: 'number', default: 4, description: 'Distance to maintain' }
        },
        required: ['username']
    },
    tags: ['movement', 'social']
};

export default async function execute(agent, params = {}) {
    const { username, distance = 4 } = params;
    const bot = agent.bot || agent;
    return await followPlayer(bot, username, distance);
}

export async function goToPlayer(bot, username, distance = 3) {
    if (bot.username === username) {
        localLog(bot, `You are already at ${username}.`);
        return true;
    }
    // We need goToGoal from go_to.js, but importing it might cause circular dep if go_to imports follow_player. 
    // go_to does NOT import follow_player. Safe to import goToGoal from go_to.
    const { goToGoal } = await import('./go_to.js');

    if (isModeOn(bot, 'cheat')) {
        bot.chat('/tp @s ' + username);
        localLog(bot, `Teleported to ${username}.`);
        return true;
    }

    pauseMode(bot, 'self_defense');
    pauseMode(bot, 'cowardice');
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

        if (distance_from_player > teleport_distance && isModeOn(bot, 'cheat')) {
            await goToPlayer(bot, username);
        }
        else if (distance_from_player > ignore_modes_distance) {
            pauseMode(bot, 'item_collecting');
            pauseMode(bot, 'hunting');
            pauseMode(bot, 'torch_placing');
        }
        else if (distance_from_player <= ignore_modes_distance) {
            unpauseMode(bot, 'item_collecting');
            unpauseMode(bot, 'hunting');
            unpauseMode(bot, 'torch_placing');
        }

        if (distance_from_player <= nearby_distance) {
            if (doorCheckInterval) { clearInterval(doorCheckInterval); doorCheckInterval = null; }
            pauseMode(bot, 'unstuck');
            pauseMode(bot, 'elbow_room');
        }
        else {
            if (!doorCheckInterval) {
                doorCheckInterval = startDoorInterval(bot);
            }
            unpauseMode(bot, 'unstuck');
            unpauseMode(bot, 'elbow_room');
        }
    }
    if (doorCheckInterval) clearInterval(doorCheckInterval);
    return true;
}
