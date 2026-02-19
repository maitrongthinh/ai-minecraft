import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import settings from "../../../settings.js";
import { goToPosition, goToNearestBlock, goToGoal } from "./go_to.js";

function log(bot, message) {
    bot.output += message + '\n';
}

function modeIsOn(bot, mode) {
    return !!(bot?.modes && typeof bot.modes.isOn === 'function' && bot.modes.isOn(mode));
}

const blockPlaceDelay = settings.block_place_delay == null ? 0 : settings.block_place_delay;
const useDelay = blockPlaceDelay > 0;

export async function breakBlockAt(bot, x, y, z) {
    if (x == null || y == null || z == null) throw new Error('Invalid position.');
    let block = bot.blockAt(new Vec3(x, y, z));
    if (block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
        if (modeIsOn(bot, 'cheat')) {
            if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
            let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' air';
            bot.chat(msg);
            log(bot, `Used /setblock to break block at ${x}, ${y}, ${z}.`);
            return true;
        }

        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            await goToPosition(bot, block.position.x, block.position.y, block.position.z, 4);
        }
        if (bot.game.gameMode !== 'creative') {
            await bot.tool.equipForBlock(block);
            const itemId = bot.heldItem ? bot.heldItem.type : null
            if (!block.canHarvest(itemId)) {
                log(bot, `Don't have right tools to break ${block.name}.`);
                return false;
            }
        }
        await bot.dig(block, true);
        log(bot, `Broke ${block.name}.`);
    }
    return true;
}

export async function placeBlock(bot, blockType, x, y, z, placeOn = 'bottom', dontCheat = false) {
    if (!blockType || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        throw new Error('Invalid placeBlock parameters: blockType, x, y, z are required');
    }
    const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));

    if (blockType === 'air') {
        return await breakBlockAt(bot, x, y, z);
    }

    if (modeIsOn(bot, 'cheat') && !dontCheat) {
        if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
        let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' ' + blockType;
        bot.chat(msg);
        log(bot, `Used /setblock to place ${blockType}.`);
        return true;
    }

    let item_name = blockType;
    if (item_name == "redstone_wire") item_name = "redstone";

    let block_item = bot.inventory.items().find(item => item.name === item_name);
    if (!block_item && bot.game.gameMode === 'creative') {
        await bot.creative.setInventorySlot(36, mc.makeItem(item_name, 1));
        block_item = bot.inventory.items().find(item => item.name === item_name);
    }
    if (!block_item) {
        log(bot, `Don't have any ${item_name} to place.`);
        return false;
    }

    const targetBlock = bot.blockAt(target_dest);
    if (targetBlock.name === blockType) return false;

    const neighbors = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)];
    let buildOffBlock = null;
    let faceVec = null;

    for (let d of neighbors) {
        const block = bot.blockAt(target_dest.plus(d));
        if (block.name !== 'air' && block.name !== 'water') {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z);
            break;
        }
    }

    if (!buildOffBlock) {
        log(bot, `Cannot place ${blockType}: nothing to place on.`);
        return false;
    }

    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        await goToPosition(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 4);
    }

    // Proximity Check: Back up if too close
    const dist = bot.entity.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5));
    if (dist < 1.3) {
        log(bot, `Too close to placement target (${dist.toFixed(2)}m). Backing up...`);
        await bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
        bot.setControlState('back', true);
        await new Promise(r => setTimeout(r, 250));
        bot.setControlState('back', false);
    }

    try {
        await bot.equip(block_item, 'hand');

        // Final sanity check for entity obstruction
        if (bot.entities) {
            const entitiesInWay = Object.values(bot.entities).filter(e =>
                e.id !== bot.entity.id &&
                e.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5)) < 0.8
            );
            if (entitiesInWay.length > 0) {
                const eNames = entitiesInWay.map(e => e.name || e.type).join(', ');
                log(bot, `Cannot place: Entity in the way (${eNames})`);
            }
        }

        await bot.placeBlock(buildOffBlock, faceVec);
        log(bot, `Placed ${blockType}.`);
        return true;
    } catch (err) {
        log(bot, `Failed to place ${blockType}: ${err.message}`);
        return false;
    }
}

export async function collectBlock(bot, blockType, num = 1, exclude = null) {
    if (num < 1) return false;
    let collected = 0;

    for (let i = 0; i < num; i++) {
        let blocks = world.getNearestBlocksWhere(bot, block => block.name === blockType, 64, 1);
        if (blocks.length === 0) break;

        const block = blocks[0];
        await bot.tool.equipForBlock(block);

        try {
            await bot.collectBlock.collect(block);
            collected++;
        } catch (err) {
            log(bot, `Failed to collect ${blockType}.`);
            continue;
        }
    }
    log(bot, `Collected ${collected} ${blockType}.`);
    return collected > 0;
}

export async function pickupNearbyItems(bot) {
    const distance = 8;
    const getNearestItem = bot => bot.nearestEntity(entity => entity.name === 'item' && bot.entity.position.distanceTo(entity.position) < distance);
    let nearestItem = getNearestItem(bot);
    let pickedUp = 0;
    while (nearestItem) {
        await goToPosition(bot, nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
        await new Promise(resolve => setTimeout(resolve, 200));
        nearestItem = getNearestItem(bot);
        pickedUp++;
    }
    log(bot, `Picked up ${pickedUp} items.`);
    return true;
}

export async function equip(bot, itemName) {
    if (itemName === 'hand') {
        await bot.unequip('hand');
        log(bot, `Unequipped hand.`);
        return true;
    }
    let item = bot.inventory.slots.find(slot => slot && slot.name === itemName);
    if (!item) {
        if (bot.game.gameMode === "creative") {
            await bot.creative.setInventorySlot(36, mc.makeItem(itemName, 1));
            item = bot.inventory.items().find(item => item.name === itemName);
        }
        else {
            log(bot, `You do not have any ${itemName} to equip.`);
            return false;
        }
    }
    if (itemName.includes('leggings')) await bot.equip(item, 'legs');
    else if (itemName.includes('boots')) await bot.equip(item, 'feet');
    else if (itemName.includes('helmet')) await bot.equip(item, 'head');
    else if (itemName.includes('chestplate') || itemName.includes('elytra')) await bot.equip(item, 'torso');
    else if (itemName.includes('shield')) await bot.equip(item, 'off-hand');
    else await bot.equip(item, 'hand');

    log(bot, `Equipped ${itemName}.`);
    return true;
}

export async function discard(bot, itemName, num = -1) {
    let discarded = 0;
    while (true) {
        let item = bot.inventory.items().find(item => item.name === itemName);
        if (!item) break;
        let to_discard = num === -1 ? item.count : Math.min(num - discarded, item.count);
        await bot.toss(item.type, null, to_discard);
        discarded += to_discard;
        if (num !== -1 && discarded >= num) break;
    }
    if (discarded === 0) {
        log(bot, `You do not have any ${itemName} to discard.`);
        return false;
    }
    log(bot, `Discarded ${discarded} ${itemName}.`);
    return true;
}

export async function putInChest(bot, itemName, num = -1) {
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    let item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to put in the chest.`);
        return false;
    }
    let to_put = num === -1 ? item.count : Math.min(num, item.count);
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    await chestContainer.deposit(item.type, null, to_put);
    await chestContainer.close();
    log(bot, `Successfully put ${to_put} ${itemName} in the chest.`);
    return true;
}

export async function takeFromChest(bot, itemName, num = -1) {
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);

    let matchingItems = chestContainer.containerItems().filter(item => item.name === itemName);
    if (matchingItems.length === 0) {
        log(bot, `Could not find any ${itemName} in the chest.`);
        await chestContainer.close();
        return false;
    }

    let totalAvailable = matchingItems.reduce((sum, item) => sum + item.count, 0);
    let remaining = num === -1 ? totalAvailable : Math.min(num, totalAvailable);
    let totalTaken = 0;

    for (const item of matchingItems) {
        if (remaining <= 0) break;
        let toTakeFromSlot = Math.min(remaining, item.count);
        await chestContainer.withdraw(item.type, null, toTakeFromSlot);
        totalTaken += toTakeFromSlot;
        remaining -= toTakeFromSlot;
    }

    await chestContainer.close();
    log(bot, `Successfully took ${totalTaken} ${itemName} from the chest.`);
    return totalTaken > 0;
}

export async function viewChest(bot) {
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    let items = chestContainer.containerItems();
    if (items.length === 0) {
        log(bot, `The chest is empty.`);
    }
    else {
        log(bot, `The chest contains:`);
        for (let item of items) {
            log(bot, `${item.count} ${item.name}`);
        }
    }
    await chestContainer.close();
    return true;
}

export async function consume(bot, itemName = "") {
    let item;
    if (itemName) {
        item = bot.inventory.items().find(item => item.name === itemName);
    }
    if (!item) {
        log(bot, `You do not have any ${itemName} to eat.`);
        return false;
    }
    await bot.equip(item, 'hand');
    await bot.consume();
    log(bot, `Consumed ${item.name}.`);
    return true;
}

export async function useDoor(bot, door_pos = null) {
    if (!door_pos) {
        for (let door_type of ['oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door',
            'mangrove_door', 'cherry_door', 'bamboo_door', 'crimson_door', 'warped_door']) {
            door_pos = world.getNearestBlock(bot, door_type, 16).position;
            if (door_pos) break;
        }
    } else {
        door_pos = Vec3(door_pos.x, door_pos.y, door_pos.z);
    }
    if (!door_pos) {
        log(bot, `Could not find a door to use.`);
        return false;
    }

    bot.pathfinder.setGoal(new pf.goals.GoalNear(door_pos.x, door_pos.y, door_pos.z, 1));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    while (bot.pathfinder.isMoving()) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    let door_block = bot.blockAt(door_pos);
    await bot.lookAt(door_pos);
    if (!door_block._properties.open)
        await bot.activateBlock(door_block);

    bot.setControlState("forward", true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    bot.setControlState("forward", false);
    await bot.activateBlock(door_block);

    log(bot, `Used door at ${door_pos}.`);
    return true;
}

export async function digDown(bot, distance = 10) {
    let start_block_pos = bot.blockAt(bot.entity.position).position;
    for (let i = 1; i <= distance; i++) {
        const targetBlock = bot.blockAt(start_block_pos.offset(0, -i, 0));
        let belowBlock = bot.blockAt(start_block_pos.offset(0, -i - 1, 0));

        if (!targetBlock || !belowBlock) {
            log(bot, `Dug down ${i - 1} blocks, but reached the end of the world.`);
            return true;
        }
        if (targetBlock.name === 'lava' || targetBlock.name === 'water' ||
            belowBlock.name === 'lava' || belowBlock.name === 'water') {
            log(bot, `Dug down ${i - 1} blocks, but reached ${belowBlock ? belowBlock.name : '(lava/water)'}`)
            return false;
        }
        const MAX_FALL_BLOCKS = 2;
        let num_fall_blocks = 0;
        let tempBelow = belowBlock;
        for (let j = 0; j <= MAX_FALL_BLOCKS; j++) {
            if (!tempBelow || (tempBelow.name !== 'air' && tempBelow.name !== 'cave_air')) break;
            num_fall_blocks++;
            tempBelow = bot.blockAt(tempBelow.position.offset(0, -1, 0));
        }
        if (num_fall_blocks > MAX_FALL_BLOCKS) {
            log(bot, `Dug down ${i - 1} blocks, but reached a drop below the next block.`);
            return false;
        }

        if (targetBlock.name === 'air' || targetBlock.name === 'cave_air') continue;

        let dug = await breakBlockAt(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z);
        if (!dug) {
            log(bot, 'Failed to dig block at position:' + targetBlock.position);
            return false;
        }
    }
    log(bot, `Dug down ${distance} blocks.`);
    return true;
}

export async function tillAndSow(bot, x, y, z, seedType = null) {
    let pos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    let block = bot.blockAt(pos);
    log(bot, `Planting ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);

    if (modeIsOn(bot, 'cheat')) {
        let to_remove = ['_seed', '_seeds'];
        for (let remove of to_remove) {
            if (seedType.endsWith(remove)) {
                seedType = seedType.replace(remove, '');
            }
        }
        placeBlock(bot, 'farmland', x, y, z);
        placeBlock(bot, seedType, x, y + 1, z);
        return true;
    }

    if (block.name !== 'grass_block' && block.name !== 'dirt' && block.name !== 'farmland') {
        log(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
        return false;
    }
    let above = bot.blockAt(new Vec3(x, y + 1, z));
    if (above.name !== 'air') {
        if (block.name === 'farmland') {
            log(bot, `Land is already farmed with ${above.name}.`);
            return true;
        }
        let broken = await breakBlockAt(bot, x, y + 1, z);
        if (!broken) {
            log(bot, `Cannot cannot break above block to till.`);
            return false;
        }
    }

    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        await goToPosition(bot, block.position.x, block.position.y, block.position.z, 4);
    }

    if (block.name !== 'farmland') {
        let hoe = bot.inventory.items().find(item => item.name.includes('hoe'));
        let to_equip = hoe?.name || 'diamond_hoe';
        if (!await equip(bot, to_equip)) {
            log(bot, `Cannot till, no hoes.`);
            return false;
        }
        await bot.activateBlock(block);
        log(bot, `Tilled block x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }

    if (seedType) {
        if (seedType.endsWith('seed') && !seedType.endsWith('seeds'))
            seedType += 's';
        let equipped_seeds = await equip(bot, seedType);
        if (!equipped_seeds) {
            log(bot, `No ${seedType} to plant.`);
            return false;
        }

        await bot.activateBlock(block);
        log(bot, `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    return true;
}

export async function useToolOn(bot, toolName, targetName) {
    if (!bot.inventory.slots.find(slot => slot && slot.name === toolName) && !bot.game.gameMode === 'creative') {
        log(bot, `You do not have any ${toolName} to use.`);
        return false;
    }

    targetName = targetName.toLowerCase();
    if (targetName === 'nothing') {
        const equipped = await equip(bot, toolName);
        if (!equipped) return false;
        await bot.activateItem();
        log(bot, `Used ${toolName}.`);
    } else if (world.isEntityType(targetName)) {
        const entity = world.getNearestEntityWhere(bot, e => e.name === targetName, 64);
        if (!entity) {
            log(bot, `Could not find any ${targetName}.`);
            return false;
        }
        await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z);
        if (toolName === 'hand') {
            await bot.unequip('hand');
        }
        else {
            const equipped = await equip(bot, toolName);
            if (!equipped) return false;
        }
        await bot.useOn(entity);
        log(bot, `Used ${toolName} on ${targetName}.`);
    } else {
        let block = null;
        if (targetName === 'water' || targetName === 'lava') {
            let blocks = world.getNearestBlocksWhere(bot, block => block.name === targetName && block.metadata === 0, 64, 1);
            if (blocks.length === 0) {
                log(bot, `Could not find any source ${targetName}.`);
                return false;
            }
            block = blocks[0];
        }
        else {
            block = world.getNearestBlock(bot, targetName, 64);
        }
        if (!block) {
            log(bot, `Could not find any ${targetName}.`);
            return false;
        }
        return await useToolOnBlock(bot, toolName, block);
    }
    return true;
}

export async function useToolOnBlock(bot, toolName, block) {
    const distance = toolName === 'water_bucket' && block.name !== 'lava' ? 1.5 : 2;
    await goToPosition(bot, block.position.x, block.position.y, block.position.z, distance);
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));

    const viewBlocked = () => {
        const blockInView = bot.blockAtCursor(5);
        const headPos = bot.entity.position.offset(0, bot.entity.height, 0);
        return blockInView &&
            !blockInView.position.equals(block.position) &&
            blockInView.position.distanceTo(headPos) < block.position.distanceTo(headPos);
    }
    if (viewBlocked()) {
        const nearbyPos = block.position.offset(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
        await goToPosition(bot, nearbyPos.x, nearbyPos.y, nearbyPos.z, 1);
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
        if (viewBlocked()) {
            return false;
        }
    }

    const equipped = await equip(bot, toolName);
    if (!equipped) return false;

    if (toolName.includes('bucket')) await bot.activateItem();
    else await bot.activateBlock(block);

    log(bot, `Used ${toolName} on ${block.name}.`);
    return true;
}
