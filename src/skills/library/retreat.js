import pf from 'mineflayer-pathfinder';
import { localLog, isModeOn } from './MovementUtils.js';
import { StrategicMovement } from "./StrategicMovement.js";
import { goToGoal } from './go_to.js';

export const metadata = {
    name: 'retreat',
    description: 'Moves away (retreats) from current position or specific entity.',
    parameters: {
        type: 'object',
        properties: {
            distance: { type: 'number', default: 16, description: 'Distance to retreat' },
            fromEntity: { type: 'string', description: 'Name of entity to retreat from' }
        }
    },
    tags: ['movement', 'survival', 'combat']
};

export default async function execute(agent, params = {}) {
    const { distance = 16, fromEntity } = params;
    const bot = agent.bot || agent;

    if (fromEntity) {
        const entity = bot.nearestEntity(e => e.name === fromEntity);
        if (entity) {
            return await moveAwayFromEntity(bot, entity, distance);
        }
    }
    return await moveAway(bot, distance);
}


export async function moveAway(bot, distance) {
    const pos = bot.entity.position;

    // Use StrategicMovement for safe vector calculation
    const safePos = StrategicMovement.findSafeRetreatPos(bot, pos, distance);

    if (safePos) {
        localLog(bot, `Retreating to safe position: ${safePos.floored()}`);
        if (isModeOn(bot, 'cheat')) {
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
