import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import { moveAwayFromEntity } from "./retreat.js";
import { goToGoal, goToPosition } from "./go_to.js";
import pf from 'mineflayer-pathfinder';
import { log } from "./util.js";
import { StrategicMovement } from "./StrategicMovement.js";
import { pickupNearbyItems } from "./interaction_skills.js";

// We need to be careful with imports.
// interaction_skills.js imports movement_skills.js
// combat_skills.js imports interaction_skills.js (pickup) and movement_skills.js (move)
// This is fine. No cycle between combat and others yet, unless interaction imports combat (it doesn't).

export async function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => item.name.includes('sword') || (item.name.includes('axe') && !item.name.includes('pickaxe')));
    if (weapons.length === 0)
        weapons = bot.inventory.items().filter(item => item.name.includes('pickaxe') || item.name.includes('shovel'));
    if (weapons.length === 0)
        return;
    weapons.sort((a, b) => b.attackDamage - a.attackDamage);
    let weapon = weapons[0];
    if (weapon)
        await bot.equip(weapon, 'hand');
}

export async function attackEntity(bot, entity, kill = true) {
    let pos = entity.position;
    await equipHighestAttack(bot);

    if (!kill) {
        if (bot.entity.position.distanceTo(pos) > 5) {
            await goToPosition(bot, pos.x, pos.y, pos.z);
        }
        await bot.attack(entity);
    }
    else {
        bot.pvp.attack(entity);
        while (world.getNearbyEntities(bot, 24).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
        }
        log(bot, `Successfully killed ${entity.name}.`);
        await pickupNearbyItems(bot);
        return true;
    }
}

export async function attackNearest(bot, mobType, kill = true) {
    bot.modes.pause('cowardice');
    if (['drowned', 'cod', 'salmon', 'tropical_fish', 'squid'].includes(mobType))
        bot.modes.pause('self_preservation');

    const mob = world.getNearbyEntities(bot, 24).find(entity => entity.name === mobType);
    if (mob) {
        return await attackEntity(bot, mob, kill);
    }
    log(bot, 'Could not find any ' + mobType + ' to attack.');
    return false;
}

export async function defendSelf(bot, range = 9) {
    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    let attacked = false;
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    while (enemy) {
        await equipHighestAttack(bot);
        bot.pvp.attack(enemy);
        attacked = true;

        while (enemy && enemy.isValid) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
            if (bot.entity.position.distanceTo(enemy.position) > range + 5) break;
        }

        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    }
    bot.pvp.stop();
    if (attacked) log(bot, `Successfully defended self.`);
    else log(bot, `No enemies nearby.`);
    return attacked;
}

export async function avoidEnemies(bot, distance = 16) {
    bot.modes.pause('self_preservation');
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
    while (enemy) {
        // Strategic Retreat
        const safePos = StrategicMovement.findSafeRetreatPos(bot, enemy.position, distance + 1);

        if (safePos) {
            const goal = new pf.goals.GoalNear(safePos.x, safePos.y, safePos.z, 1);
            bot.pathfinder.setMovements(new pf.Movements(bot));
            bot.pathfinder.setGoal(goal, true);
        } else {
            // Fallback: fight if cornered? or just basic invert
            const follow = new pf.goals.GoalFollow(enemy, distance + 1);
            const inverted_goal = new pf.goals.GoalInvert(follow);
            bot.pathfinder.setMovements(new pf.Movements(bot));
            // Don't error if impossible
            try { bot.pathfinder.setGoal(inverted_goal, true); } catch (e) { }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
        if (bot.interrupt_code) {
            break;
        }
        if (enemy && bot.entity.position.distanceTo(enemy.position) < 3) {
            await attackEntity(bot, enemy, false); // Retaliate if too close
        }
    }
    bot.pathfinder.stop();
    log(bot, `Moved ${distance} away from enemies.`);
    return true;
}
