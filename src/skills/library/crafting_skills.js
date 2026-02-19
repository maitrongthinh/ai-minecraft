import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import { placeBlock, collectBlock } from "./interaction_skills.js"; // Circular dependency risk? Need to be careful.
import { goToNearestBlock } from "./go_to.js";

export function log(bot, message) {
    bot.output += message + '\n';
}

export async function craftRecipe(bot, itemName, num = 1) {
    let placedTable = false;

    if (mc.getItemCraftingRecipes(itemName).length == 0) {
        log(bot, `${itemName} is either not an item, or it does not have a crafting recipe!`);
        return false;
    }

    // get recipes that don't require a crafting table
    let recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, null);
    let craftingTable = null;
    const craftingTableRange = 16;
    placeTable: if (!recipes || recipes.length === 0) {
        recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, true);
        if (!recipes || recipes.length === 0) break placeTable;

        // Look for crafting table
        craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
        if (craftingTable === null) {

            // Try to place crafting table
            let hasTable = world.getInventoryCounts(bot)['crafting_table'] > 0;
            if (hasTable) {
                let pos = world.getNearestFreeSpace(bot, 1, 6);
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
                if (craftingTable) {
                    recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
                    placedTable = true;
                }
            }
            else {
                log(bot, `Crafting ${itemName} requires a crafting table.`)
                return false;
            }
        }
        else {
            recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
        }
    }
    if (!recipes || recipes.length === 0) {
        log(bot, `You do not have the resources to craft a ${itemName}.`);
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1);
        }
        return false;
    }

    if (craftingTable && bot.entity.position.distanceTo(craftingTable.position) > 4) {
        // We need a way to invoke movement without circular deps if possible
        // For now, assuming world.js or similar helper, or re-implement
        // In the original, it used goToNearestBlock from same file.
        // We might need a `movement_skills.js`
        // For now, we stub or import from a utils.
        await goToNearestBlock(bot, 'crafting_table', 4, craftingTableRange);
    }

    const recipe = recipes[0];
    console.log('crafting...');
    const inventory = world.getInventoryCounts(bot);
    const requiredIngredients = mc.ingredientsFromPrismarineRecipe(recipe);
    const craftLimit = mc.calculateLimitingResource(inventory, requiredIngredients);

    await bot.craft(recipe, Math.min(craftLimit.num, num), craftingTable);
    if (craftLimit.num < num) log(bot, `Not enough ${craftLimit.limitingResource} to craft ${num}, crafted ${craftLimit.num}.`);
    else log(bot, `Successfully crafted ${itemName}.`);
    if (placedTable) {
        await collectBlock(bot, 'crafting_table', 1);
    }

    if (bot.armorManager) bot.armorManager.equipAll();

    return true;
}

export async function smeltItem(bot, itemName, num = 1) {
    if (!mc.isSmeltable(itemName)) {
        log(bot, `Cannot smelt ${itemName}.`);
        return false;
    }

    let placedFurnace = false;
    let furnaceBlock = undefined;
    const furnaceRange = 16;
    furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
    if (!furnaceBlock) {
        let hasFurnace = world.getInventoryCounts(bot)['furnace'] > 0;
        if (hasFurnace) {
            let pos = world.getNearestFreeSpace(bot, 1, furnaceRange);
            await placeBlock(bot, 'furnace', pos.x, pos.y, pos.z);
            furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
            placedFurnace = true;
        }
    }
    if (!furnaceBlock) {
        log(bot, `There is no furnace nearby and you have no furnace.`)
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, furnaceRange);
    }
    bot.modes.pause('unstuck');
    await bot.lookAt(furnaceBlock.position);

    console.log('smelting...');
    const furnace = await bot.openFurnace(furnaceBlock);
    let input_item = furnace.inputItem();
    if (input_item && input_item.type !== mc.getItemId(itemName) && input_item.count > 0) {
        log(bot, `The furnace is currently smelting ${mc.getItemName(input_item.type)}.`);
        if (placedFurnace) await collectBlock(bot, 'furnace', 1);
        return false;
    }
    let inv_counts = world.getInventoryCounts(bot);
    if (!inv_counts[itemName] || inv_counts[itemName] < num) {
        log(bot, `You do not have enough ${itemName} to smelt.`);
        if (placedFurnace) await collectBlock(bot, 'furnace', 1);
        return false;
    }

    if (!furnace.fuelItem()) {
        let fuel = mc.getSmeltingFuel(bot);
        if (!fuel) {
            log(bot, `You have no fuel.`);
            if (placedFurnace) await collectBlock(bot, 'furnace', 1);
            return false;
        }
        const put_fuel = Math.ceil(num / mc.getFuelSmeltOutput(fuel.name));
        if (fuel.count < put_fuel) {
            log(bot, `Not enough fuel.`);
            if (placedFurnace) await collectBlock(bot, 'furnace', 1);
            return false;
        }
        await furnace.putFuel(fuel.type, null, put_fuel);
    }
    await furnace.putInput(mc.getItemId(itemName), null, num);

    let total = 0;
    let smelted_item = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    let last_collected = Date.now();
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (furnace.outputItem()) {
            smelted_item = await furnace.takeOutput();
            if (smelted_item) {
                total += smelted_item.count;
                last_collected = Date.now();
            }
        }
        if (Date.now() - last_collected > 11000) break;
        if (bot.interrupt_code) break;
    }

    if (furnace.inputItem()) await furnace.takeInput();
    if (furnace.fuelItem()) await furnace.takeFuel();
    await bot.closeWindow(furnace);

    if (placedFurnace) await collectBlock(bot, 'furnace', 1);

    if (total === 0) {
        log(bot, `Failed to smelt ${itemName}.`);
        return false;
    }
    log(bot, `Successfully smelted ${itemName}.`);
    return true;
}

export async function clearNearestFurnace(bot) {
    let furnaceBlock = world.getNearestBlock(bot, 'furnace', 32);
    if (!furnaceBlock) {
        log(bot, `No furnace nearby.`);
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, 32);
    }

    const furnace = await bot.openFurnace(furnaceBlock);
    if (furnace.outputItem()) await furnace.takeOutput();
    if (furnace.inputItem()) await furnace.takeInput();
    if (furnace.fuelItem()) await furnace.takeFuel();
    log(bot, `Cleared furnace.`);
    return true;
}
