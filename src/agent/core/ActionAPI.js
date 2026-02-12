import minecraftData from 'minecraft-data';
import { RetryHelper } from '../../utils/RetryHelper.js';
import { placeBlock as placeBlockSkill } from '../../skills/library/interaction_skills.js';
import { smeltItem as smeltItemSkill } from '../../skills/library/crafting_skills.js';
import { MotorCortex } from './MotorCortex.js';

/**
 * ActionAPI
 *
 * Unified, retry-aware primitive actions used by higher-level systems.
 * Keeps survival-critical mechanics deterministic and reusable.
 */
export class ActionAPI {
    constructor(agent) {
        this.agent = agent;
        this.motorCortex = new MotorCortex(this.agent.bot);
    }

    /**
     * JSON-RPC Dispatcher
     * @param {Object} directive - { type: string, params: Object, action_id: string }
     */
    async dispatch(directive) {
        const { type, params, action_id } = directive;
        console.log(`[ActionAPI] 🚀 Dispatching action: ${type} (${action_id || 'untracked'})`);

        if (typeof this[type.toLowerCase()] === 'function') {
            try {
                const result = await this[type.toLowerCase()](params);
                return { action_id, ...result };
            } catch (error) {
                return { action_id, success: false, error: error.message };
            }
        }

        // Fallback to searching skills if not a primitive
        if (this.agent.skillLibrary) {
            const skill = this.agent.skillLibrary.getSkill(type);
            if (skill) {
                // Execute skill in sandbox or directly
                const result = await this.agent.intelligence.execute(type, params);
                return { action_id, ...result };
            }
        }

        return { action_id, success: false, error: `Unknown action type: ${type}` };
    }

    async humanlook(params) {
        const { position, urgency } = params;
        return await this.motorCortex.humanLook(position, urgency || 1.0);
    }

    async mine(params) {
        const { targetBlock, options = {} } = params;
        const bot = this._getBot();
        if (!targetBlock) {
            return { success: false, action: 'mine', error: 'Missing target block' };
        }

        const executor = options.executor || (async () => {
            await bot.dig(targetBlock, true);
        });

        return await this._runWithRetry('mine', executor, options.retries ?? 2, options.baseDelay ?? 250);
    }

    async craft(params) {
        const { itemName, count = 1, options = {} } = params;
        const bot = this._getBot();
        if (!itemName) {
            return { success: false, action: 'craft', error: 'Missing item name' };
        }

        const executor = options.executor || (async () => {
            const data = minecraftData(bot.version);
            const item = data.itemsByName[itemName];
            if (!item) throw new Error(`Unknown item: ${itemName}`);

            const craftingTable = options.craftingTable || bot.findBlock({
                matching: data.blocksByName?.crafting_table?.id,
                maxDistance: options.maxDistance ?? 32
            }) || null;

            const recipes = bot.recipesFor(item.id, null, count, craftingTable);
            if (!recipes || recipes.length === 0) {
                throw new Error(`No recipe available for ${itemName}`);
            }

            await bot.craft(recipes[0], count, craftingTable);
        });

        return await this._runWithRetry('craft', executor, options.retries ?? 2, options.baseDelay ?? 300);
    }

    async place(params) {
        const { blockType, position, options = {} } = params;
        const bot = this._getBot();
        if (!blockType || !position) {
            return { success: false, action: 'place', error: 'Missing blockType or position' };
        }

        const executor = options.executor || (async () => {
            const ok = await placeBlockSkill(
                bot,
                blockType,
                position.x,
                position.y,
                position.z,
                options.placeOn || 'bottom',
                !!options.dontCheat
            );
            if (!ok) {
                throw new Error(`Failed to place ${blockType} at (${position.x}, ${position.y}, ${position.z})`);
            }
        });

        return await this._runWithRetry('place', executor, options.retries ?? 2, options.baseDelay ?? 250);
    }

    async smelt(params) {
        const { itemName, count = 1, options = {} } = params;
        this._getBot();
        if (!itemName) {
            return { success: false, action: 'smelt', error: 'Missing item name' };
        }

        const executor = options.executor || (async () => {
            const ok = await smeltItemSkill(this.agent.bot, itemName, count);
            if (!ok) {
                throw new Error(`Failed to smelt ${itemName}`);
            }
        });

        return await this._runWithRetry('smelt', executor, options.retries ?? 2, options.baseDelay ?? 400);
    }

    async moveto(params) {
        const { position, options = {} } = params;
        const bot = this._getBot();
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
            return { success: false, action: 'move_to', error: 'Missing valid target position' };
        }

        const executor = options.executor || (async () => {
            const { goToPosition } = await import('../../skills/library/movement_skills.js');
            const minDistance = options.minDistance ?? 2;
            const timeoutMs = options.timeoutMs ?? 25000;

            const moved = await Promise.race([
                goToPosition(bot, position.x, position.y, position.z, minDistance),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Move timeout after ${timeoutMs}ms`)), timeoutMs))
            ]);

            if (!moved) {
                throw new Error(`Move failed to (${position.x}, ${position.y}, ${position.z})`);
            }
        });

        return await this._runWithRetry('move_to', executor, options.retries ?? 1, options.baseDelay ?? 300);
    }

    async gather_nearby(params) {
        const { matching, count = 1, options = {} } = params;
        const bot = this._getBot();
        if (!matching) {
            return { success: false, action: 'gather_nearby', gathered: 0, error: 'Missing block matcher' };
        }

        const matcher = typeof matching === 'function'
            ? matching
            : (block) => {
                if (!block) return false;
                if (typeof matching === 'number') return block.type === matching;
                if (typeof matching === 'string') return block.name === matching || block.name?.includes(matching);
                return false;
            };

        let gathered = 0;
        let attempts = 0;
        const target = Math.max(1, count);
        const maxDistance = options.maxDistance ?? 48;
        const maxSearchAttempts = options.maxSearchAttempts ?? target * 4;
        const reachDistance = options.reachDistance ?? 4.7;
        const continueOnError = options.continueOnError ?? true;
        const blockedTargets = new Set();
        const toKey = (pos) => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;

        const findTargetBlock = () => bot.findBlock({
            matching: (block) => {
                if (!matcher(block)) return false;
                if (!block?.position) return false;
                return !blockedTargets.has(toKey(block.position));
            },
            maxDistance
        });

        for (let i = 0; i < maxSearchAttempts && gathered < target; i++) {
            const block = findTargetBlock();
            if (!block) break;
            const hasPosition = !!block?.position;
            const targetKey = hasPosition ? toKey(block.position) : `ephemeral:${i}`;

            attempts++;
            if (
                hasPosition &&
                bot?.entity?.position &&
                typeof bot.entity.position.distanceTo === 'function' &&
                bot.entity.position.distanceTo(block.position) > reachDistance
            ) {
                const move = await this.moveto({
                    position: block.position,
                    options: {
                        minDistance: options.minDistance ?? 2,
                        timeoutMs: options.moveTimeoutMs ?? 20000,
                        retries: options.moveRetries ?? 1
                    }
                });
                if (!move.success) {
                    blockedTargets.add(targetKey);
                    if (!continueOnError) {
                        return {
                            success: gathered > 0,
                            action: 'gather_nearby',
                            attempts,
                            gathered,
                            error: move.error || 'Move failed'
                        };
                    }
                    continue;
                }
            }

            const mineResult = hasPosition
                ? await this.mine({
                    targetBlock: block,
                    options: {
                        retries: options.retries ?? 1,
                        baseDelay: options.baseDelay ?? 250,
                        executor: async () => {
                            const latest = bot.blockAt(block.position);
                            if (!latest || !matcher(latest)) {
                                throw new Error('Target block disappeared');
                            }
                            if (bot.entity.position.distanceTo(latest.position) > reachDistance + 0.3) {
                                throw new Error('Target block is out of reach');
                            }
                            if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(latest)) {
                                throw new Error('Target block is not diggable');
                            }
                            await bot.dig(latest, true);
                        }
                    }
                })
                : await this.mine({ targetBlock: block, options: { retries: options.retries ?? 1, baseDelay: options.baseDelay ?? 250 } });
            if (mineResult.success) {
                gathered++;
                blockedTargets.delete(targetKey);
                if (options.collectDrops) {
                    await this.collect_drops({ radius: 8, maxItems: 3, retries: 0 });
                }
            } else {
                blockedTargets.add(targetKey);
            }

            if (!mineResult.success && !continueOnError) {
                return {
                    success: gathered > 0,
                    action: 'gather_nearby',
                    attempts,
                    gathered,
                    error: mineResult.error || 'Mining failed'
                };
            }
        }

        return {
            success: gathered > 0,
            action: 'gather_nearby',
            attempts,
            gathered,
            target,
            retriesUsed: Math.max(0, attempts - gathered)
        };
    }

    async ensure_item(params) {
        const { itemName, targetCount = 1, options = {} } = params;
        const bot = this._getBot();
        if (!itemName) {
            return { success: false, action: 'ensure_item', error: 'Missing item name' };
        }

        const current = this._countItem(bot, itemName);
        if (current >= targetCount) {
            return { success: true, action: 'ensure_item', item: itemName, count: current, alreadyHad: true };
        }

        const need = Math.max(1, targetCount - current);
        let craftResult;
        if (itemName === 'planks') {
            craftResult = await this.craftfirstavailable({
                itemCandidates: [
                    'oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks',
                    'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks'
                ],
                count: need,
                options
            });
        } else if (itemName === 'crafting_table') {
            await this.craftfirstavailable({
                itemCandidates: [
                    'oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks',
                    'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks'
                ],
                count: 4,
                options
            });
            craftResult = await this.craft({ itemName, count: need, options });
        } else if (itemName === 'stick') {
            await this.craftfirstavailable({
                itemCandidates: [
                    'oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks',
                    'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks'
                ],
                count: 2,
                options
            });
            craftResult = await this.craft({ itemName, count: need, options });
        } else {
            craftResult = await this.craft({ itemName, count: need, options });
        }

        const after = this._countItem(bot, itemName);
        return {
            success: craftResult.success && after >= targetCount,
            action: 'ensure_item',
            attempts: craftResult.attempts || 0,
            item: itemName,
            count: after,
            needed: targetCount,
            error: craftResult.success ? undefined : craftResult.error
        };
    }

    async collect_drops(params) {
        const { radius = 8, maxItems = 6, options = {} } = params;
        const bot = this._getBot();
        let attempts = 0;
        let collected = 0;
        let foundAny = false;

        for (let i = 0; i < maxItems; i++) {
            const entity = bot.nearestEntity(e =>
                e?.name === 'item' &&
                e.position &&
                bot.entity.position.distanceTo(e.position) <= radius
            );
            if (!entity) break;
            foundAny = true;

            attempts++;
            const move = await this.moveto({
                position: entity.position,
                options: {
                    minDistance: 1,
                    timeoutMs: options.timeoutMs ?? 12000,
                    retries: options.retries ?? 0
                }
            });
            if (!move.success) {
                if (!options.continueOnError) {
                    return { success: collected > 0, action: 'collect_drops', attempts, collected, error: move.error };
                }
                continue;
            }

            await new Promise(resolve => setTimeout(resolve, 250));
            collected++;
        }

        return {
            success: true,
            action: 'collect_drops',
            attempts,
            collected,
            skipped: !foundAny
        };
    }

    async eat_if_hungry(params = {}) {
        const { threshold = 14, options = {} } = params;
        const bot = this._getBot();
        if (bot.food >= threshold) {
            return { success: true, action: 'eat_if_hungry', skipped: true, food: bot.food };
        }

        const data = minecraftData(bot.version);
        const foodItem = bot.inventory.items().find(i => data.foodsByName?.[i.name]);
        if (!foodItem) {
            return { success: false, action: 'eat_if_hungry', error: 'No edible food found in inventory' };
        }

        const executor = options.executor || (async () => {
            await bot.equip(foodItem, 'hand');
            await bot.consume();
        });

        const result = await this._runWithRetry('eat_if_hungry', executor, options.retries ?? 1, options.baseDelay ?? 250);
        return { ...result, food: bot.food };
    }

    async craftfirstavailable(params) {
        const { itemCandidates = [], count = 1, options = {} } = params;
        if (!Array.isArray(itemCandidates) || itemCandidates.length === 0) {
            return { success: false, action: 'craft_first_available', error: 'No candidate items provided' };
        }
        const bot = this._getBot();
        const inventoryItems = typeof bot.inventory?.items === 'function' ? bot.inventory.items() : [];
        const candidates = itemCandidates.map(name => String(name));
        let prioritizedCandidates = [...candidates];

        // Fast-fail to avoid repeated recipe spam when no wood source exists.
        const onlyPlanks = candidates.every(name => name.endsWith('_planks'));
        if (onlyPlanks && inventoryItems.length > 0) {
            const hasWoodSource = inventoryItems.some(item =>
                item?.name &&
                (
                    item.name.includes('_log') ||
                    item.name.endsWith('_stem') ||
                    item.name.endsWith('_hyphae') ||
                    item.name === 'bamboo'
                )
            );
            if (!hasWoodSource) {
                return {
                    success: false,
                    action: 'craft_first_available',
                    error: 'No wood source in inventory for plank crafting'
                };
            }
        }

        let attempts = 0;
        let lastError = 'No craft candidate succeeded';
        for (const itemName of prioritizedCandidates) {
            const targetCount = Math.max(1, Number(count) || 1);
            const requestedCounts = [...new Set([targetCount, Math.ceil(targetCount / 2), 1])];
            for (const reqCount of requestedCounts) {
                attempts++;
                const result = await this.craft({ itemName, count: reqCount, options });
                if (result.success) {
                    return {
                        ...result,
                        action: 'craft_first_available',
                        craftedItem: itemName,
                        craftedCount: reqCount,
                        attempts
                    };
                }
                lastError = result.error || lastError;
            }
        }

        return { success: false, action: 'craft_first_available', attempts, error: lastError };
    }

    _getBot() {
        if (!this.agent?.bot) {
            throw new Error('BotNotReady: bot instance is not available');
        }
        return this.agent.bot;
    }

    _countItem(bot, itemName) {
        if (!itemName) return 0;
        return bot.inventory.items()
            .filter(i => i.name === itemName)
            .reduce((sum, i) => sum + i.count, 0);
    }

    async _runWithRetry(action, executor, retries = 2, baseDelay = 250) {
        let attempts = 0;
        try {
            await RetryHelper.retry(
                async () => {
                    attempts++;
                    return await executor();
                },
                {
                    context: `ActionAPI:${action}`,
                    maxRetries: retries,
                    baseDelay,
                    maxDelay: 2000
                }
            );

            return {
                success: true,
                action,
                attempts,
                retriesUsed: Math.max(0, attempts - 1)
            };
        } catch (error) {
            return {
                success: false,
                action,
                attempts,
                error: error.message
            };
        }
    }
}

export default ActionAPI;
