import minecraftData from 'minecraft-data';
import Vec3 from 'vec3';
import { RetryHelper } from '../../utils/RetryHelper.js';
import { placeBlock as placeBlockSkill } from '../../skills/library/interaction_skills.js';
import { smeltItem as smeltItemSkill, craftRecipe as craftRecipeSkill } from '../../skills/library/crafting_skills.js';
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
        this.motorCortex = new MotorCortex(agent); // Pass agent instead of potentially null bot
    }

    /**
     * JSON-RPC Dispatcher
     * @param {Object} directive - { type: string, params: Object, action_id: string }
     */
    async dispatch(directive) {
        const { type, params, action_id } = directive;
        console.log(`[ActionAPI] 🚀 Dispatching action: ${type} (${action_id || 'untracked'})`);

        // Wiki Tools Interception
        if (type === 'wiki_search') {
            if (!this.agent.wiki) return { action_id, success: false, error: "Wiki tool not initialized" };
            const res = await this.agent.wiki.searchGeneral(params.query);
            return { action_id, success: !!res, data: res || "Not found" };
        }
        if (type === 'wiki_recipe') {
            if (!this.agent.wiki) return { action_id, success: false, error: "Wiki tool not initialized" };
            const res = await this.agent.wiki.searchRecipe(params.item);
            return { action_id, success: !!res, data: res || "Recipe not found" };
        }
        if (type === 'wiki_mob') {
            if (!this.agent.wiki) return { action_id, success: false, error: "Wiki tool not initialized" };
            const res = await this.agent.wiki.getMobInfo(params.mob);
            return { action_id, success: !!res, data: res || "Mob info not found" };
        }

        if (typeof this[type.toLowerCase()] === 'function') {
            try {
                const effectiveParams = this._applyPolicy(type.toLowerCase(), params || {});
                const result = await this[type.toLowerCase()](effectiveParams);
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

    async mine(params, legacyOptions = {}) {
        let normalizedParams;
        if (params && typeof params === 'object' && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, 'targetBlock')) {
            normalizedParams = {
                ...params,
                options: { ...(params.options || {}) }
            };
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        } else {
            normalizedParams = {
                targetBlock: params,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['targetBlock']);
        params = this._applyPolicy('mine', normalizedParams || {});
        const { targetBlock, options = {} } = this._normalizeOptionsPayload(params || {}, ['targetBlock']);
        const bot = this._getBot();
        if (!targetBlock) {
            return { success: false, action: 'mine', error: 'Missing target block' };
        }

        const executor = options.executor || (async () => {
            // Phase 4: MotorCortex Integration for Natural Looking
            if (this.motorCortex) {
                await this.motorCortex.humanLook(targetBlock.position, 1.2);
            }
            // Disable force-look (`true`) to prevent robotic snap-back, rely on MotorCortex
            await bot.dig(targetBlock, false);
        });

        return await this._runWithRetry('mine', executor, options.retries ?? 2, options.baseDelay ?? 250);
    }

    async craft(params, legacyCount = 1, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'string') {
            normalizedParams = {
                itemName: params,
                count: legacyCount ?? 1,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyCount && typeof legacyCount === 'object' && !Array.isArray(legacyCount)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyCount };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['itemName', 'count']);
        params = this._applyPolicy('craft', normalizedParams || {});
        const { itemName, count = 1, options = {} } = this._normalizeOptionsPayload(params || {}, ['itemName', 'count']);
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
                const fallbackOk = await craftRecipeSkill(bot, itemName, count);
                if (!fallbackOk) {
                    throw new Error(`No recipe available for ${itemName}`);
                }
                return;
            }

            await bot.craft(recipes[0], count, craftingTable);
        });

        return await this._runWithRetry('craft', executor, options.retries ?? 2, options.baseDelay ?? 300);
    }

    async place(params, legacyPosition = null, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'string') {
            normalizedParams = {
                blockType: params,
                position: legacyPosition,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyPosition && typeof legacyPosition === 'object' && !Array.isArray(legacyPosition) && Object.prototype.hasOwnProperty.call(legacyPosition, 'x')) {
                normalizedParams.position = normalizedParams.position || legacyPosition;
            } else if (legacyPosition && typeof legacyPosition === 'object' && !Array.isArray(legacyPosition)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyPosition };
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['blockType', 'position']);
        params = this._applyPolicy('place', normalizedParams || {});
        const { blockType, position, options = {} } = this._normalizeOptionsPayload(params || {}, ['blockType', 'position']);
        const bot = this._getBot();
        if (!blockType || !position) {
            return { success: false, action: 'place', error: 'Missing blockType or position' };
        }

        const executor = options.executor || (async () => {
            // Ensure position is a Vec3 object for .offset() support
            const vPosition = (position instanceof Vec3) ? position : new Vec3(position.x, position.y, position.z);

            // Phase 4: MotorCortex Integration
            if (this.motorCortex) {
                // Ensure motorCortex has the latest bot instance
                this.motorCortex.bot = bot;

                // Look at the placement face
                const lookPos = vPosition.offset(0.5, 0.5, 0.5); // Center of block
                await this.motorCortex.humanLook(lookPos, 1.2);
            }

            const ok = await placeBlockSkill(
                bot,
                blockType,
                vPosition.x,
                vPosition.y,
                vPosition.z,
                options.placeOn || 'bottom',
                !!options.dontCheat
            );
            if (!ok) {
                throw new Error(`Failed to place ${blockType} at (${position.x}, ${position.y}, ${position.z})`);
            }
        });

        return await this._runWithRetry('place', executor, options.retries ?? 2, options.baseDelay ?? 250);
    }

    async smelt(params, legacyCount = 1, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'string') {
            normalizedParams = {
                itemName: params,
                count: legacyCount ?? 1,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyCount && typeof legacyCount === 'object' && !Array.isArray(legacyCount)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyCount };
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['itemName', 'count']);
        params = this._applyPolicy('smelt', normalizedParams || {});
        const { itemName, count = 1, options = {} } = this._normalizeOptionsPayload(params || {}, ['itemName', 'count']);
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

    async moveto(params, legacyOptions = {}) {
        let normalizedParams;
        if (params && typeof params === 'object' && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, 'position')) {
            normalizedParams = {
                ...params,
                options: { ...(params.options || {}) }
            };
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        } else if (params && typeof params === 'object' && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, 'x')) {
            normalizedParams = {
                position: params,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                position: null,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['position']);
        params = this._applyPolicy('move_to', normalizedParams || {});
        const { position, options = {} } = this._normalizeOptionsPayload(params || {}, ['position']);
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
    async safe_wander(distance = 3) {
        const bot = this._getBot();
        if (!bot?.entity?.position) return { success: false };

        // Random angle
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle) * distance;
        const dz = Math.sin(angle) * distance;
        const target = bot.entity.position.offset(dx, 0, dz);

        // Use simple movement to "unstick"
        console.log(`[ActionAPI] 🦶 Wandering to unstuck: ${target}`);
        return await this.moveto({ position: target, options: { timeoutMs: 5000, minDistance: 1 } });
    }

    async gather_nearby(params, legacyCount = 1, legacyOptions = {}) {
        let normalizedParams;
        if (params && typeof params === 'object' && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, 'matching')) {
            normalizedParams = {
                ...params,
                options: { ...(params.options || {}) }
            };
            if (legacyCount && typeof legacyCount === 'object' && !Array.isArray(legacyCount)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyCount };
            } else if (legacyCount !== undefined && legacyCount !== null && typeof legacyCount !== 'object') {
                normalizedParams.count = normalizedParams.count ?? legacyCount;
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        } else {
            normalizedParams = {
                matching: params,
                count: (legacyCount && typeof legacyCount === 'object') ? 1 : (legacyCount ?? 1),
                options: {}
            };
            if (legacyCount && typeof legacyCount === 'object' && !Array.isArray(legacyCount)) {
                normalizedParams.options = { ...legacyCount };
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['matching', 'count']);
        params = this._applyPolicy('gather_nearby', normalizedParams || {});
        const { matching, count = 1, options = {} } = this._normalizeOptionsPayload(params || {}, ['matching', 'count']);
        const bot = this._getBot();
        if (!matching) {
            return { success: false, action: 'gather_nearby', gathered: 0, error: 'Missing block matcher' };
        }

        const matcher = typeof matching === 'function'
            ? matching
            : (block) => {
                if (!block) return false;
                if (Array.isArray(matching)) return matching.includes(block.name) || matching.some(m => block.name?.includes(m));
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
        let consecutiveMoveFailures = 0;

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
                    consecutiveMoveFailures++;
                    console.warn(`[ActionAPI] Move failed (${consecutiveMoveFailures}/3). Blocked target.`);

                    if (consecutiveMoveFailures >= 3) {
                        console.warn('[ActionAPI] ⚠️ Too many move failures. Attempting safe_wander to unstuck...');
                        await this.safe_wander(4);
                        consecutiveMoveFailures = 0; // Reset counter after wander
                    }

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
                consecutiveMoveFailures = 0; // Reset on success
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
                if (!continueOnError) {
                    return {
                        success: gathered > 0,
                        action: 'gather_nearby',
                        attempts,
                        gathered,
                        error: mineResult.error || 'Mining failed'
                    };
                }
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

    async ensure_item(params, legacyTargetCount = 1, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'string') {
            normalizedParams = {
                itemName: params,
                targetCount: legacyTargetCount ?? 1,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyTargetCount && typeof legacyTargetCount === 'object' && !Array.isArray(legacyTargetCount)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyTargetCount };
            } else if (legacyTargetCount !== undefined && legacyTargetCount !== null && typeof legacyTargetCount !== 'object') {
                normalizedParams.targetCount = normalizedParams.targetCount ?? legacyTargetCount;
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['itemName', 'targetCount']);
        params = this._applyPolicy('ensure_item', normalizedParams || {});
        const { itemName, targetCount = 1, options = {} } = this._normalizeOptionsPayload(params || {}, ['itemName', 'targetCount']);
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
            craftResult = await this.craft(itemName, need, options);
        } else if (itemName === 'stick') {
            await this.craftfirstavailable({
                itemCandidates: [
                    'oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks',
                    'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks'
                ],
                count: 2,
                options
            });
            craftResult = await this.craft(itemName, need, options);
        } else if (this._isTool(itemName)) {
            // Smart Tool Crafting: Check for sticks and base material
            await this._ensureToolMaterials(itemName, options);
            craftResult = await this.craft(itemName, need, options);
        } else {
            craftResult = await this.craft(itemName, need, options);
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

    _isTool(name) {
        return name.endsWith('_pickaxe') || name.endsWith('_sword') ||
            name.endsWith('_axe') || name.endsWith('_shovel') || name.endsWith('_hoe');
    }

    async _ensureToolMaterials(toolName, options) {
        // Simple heuristic: Most tools need sticks + material
        // e.g. wooden_pickaxe -> planks + sticks
        // e.g. stone_pickaxe -> cobblestone + sticks
        const bot = this._getBot();

        // Ensure Sticks first (usually needed for handle)
        const sticks = this._countItem(bot, 'stick');
        if (sticks < 2) {
            await this.ensure_item({ itemName: 'stick', targetCount: 4, options });
        }

        // Ensure Head Material
        let material = null;
        if (toolName.startsWith('wooden_')) material = 'planks';
        else if (toolName.startsWith('stone_')) material = 'cobblestone';
        else if (toolName.startsWith('iron_')) material = 'iron_ingot';
        else if (toolName.startsWith('diamond_')) material = 'diamond';
        else if (toolName.startsWith('golden_')) material = 'gold_ingot';

        if (material) {
            const matCount = this._countItem(bot, material);
            if (matCount < 3) { // Safe bet: most tools need max 3
                if (material === 'planks') {
                    // Craft planks from logs if needed
                    await this.ensure_item({ itemName: 'planks', targetCount: 8, options });
                }
                // For stone/iron/diamond, we can't easily "craft" them from thin air (needs mining/smelting), 
                // so we just hope they are in inventory or the prev step gathered them.
                // But for planks, we definitely can craft them from logs.
            }
        }
    }

    async collect_drops(params, legacyMaxItems = 6, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'number') {
            normalizedParams = {
                radius: params,
                maxItems: legacyMaxItems ?? 6,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyMaxItems && typeof legacyMaxItems === 'object' && !Array.isArray(legacyMaxItems)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyMaxItems };
            } else if (legacyMaxItems !== undefined && legacyMaxItems !== null && typeof legacyMaxItems !== 'object') {
                normalizedParams.maxItems = normalizedParams.maxItems ?? legacyMaxItems;
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['radius', 'maxItems']);
        params = this._applyPolicy('collect_drops', normalizedParams || {});
        const { radius = 8, maxItems = 6, options = {} } = this._normalizeOptionsPayload(params || {}, ['radius', 'maxItems']);
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

    async eat_if_hungry(params = {}, legacyOptions = {}) {
        let normalizedParams;
        if (typeof params === 'number') {
            normalizedParams = {
                threshold: params,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['threshold']);
        params = this._applyPolicy('eat_if_hungry', normalizedParams || {});
        const { threshold = 14, options = {} } = this._normalizeOptionsPayload(params || {}, ['threshold']);
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

    async craftfirstavailable(params, legacyCount = 1, legacyOptions = {}) {
        let normalizedParams;
        if (Array.isArray(params)) {
            normalizedParams = {
                itemCandidates: params,
                count: legacyCount ?? 1,
                options: (legacyOptions && typeof legacyOptions === 'object') ? { ...legacyOptions } : {}
            };
        } else {
            normalizedParams = {
                ...(params || {}),
                options: { ...((params && params.options) || {}) }
            };
            if (legacyCount && typeof legacyCount === 'object' && !Array.isArray(legacyCount)) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyCount };
            } else if (legacyCount !== undefined && legacyCount !== null && typeof legacyCount !== 'object') {
                normalizedParams.count = normalizedParams.count ?? legacyCount;
            }
            if (legacyOptions && typeof legacyOptions === 'object' && Object.keys(legacyOptions).length > 0) {
                normalizedParams.options = { ...normalizedParams.options, ...legacyOptions };
            }
        }

        normalizedParams = this._normalizeOptionsPayload(normalizedParams, ['itemCandidates', 'count']);
        params = this._applyPolicy('craft_first_available', normalizedParams || {});
        const { itemCandidates = [], count = 1, options = {} } = this._normalizeOptionsPayload(params || {}, ['itemCandidates', 'count']);
        if (!Array.isArray(itemCandidates) || itemCandidates.length === 0) {
            return { success: false, action: 'craft_first_available', error: 'No candidate items provided' };
        }
        const bot = this._getBot();
        const inventoryItems = typeof bot.inventory?.items === 'function' ? bot.inventory.items() : [];
        const candidates = itemCandidates.map(name => String(name));
        let prioritizedCandidates = [...candidates];

        // Optional fast-fail to avoid repeated recipe spam when no wood source exists.
        const requireWoodSource = options.requireWoodSource === true;
        const onlyPlanks = candidates.every(name => name.endsWith('_planks'));
        if (onlyPlanks && requireWoodSource) {
            const plankByWood = {
                oak_log: 'oak_planks',
                birch_log: 'birch_planks',
                spruce_log: 'spruce_planks',
                jungle_log: 'jungle_planks',
                acacia_log: 'acacia_planks',
                dark_oak_log: 'dark_oak_planks',
                mangrove_log: 'mangrove_planks',
                cherry_log: 'cherry_planks',
                bamboo: 'bamboo_planks',
                crimson_stem: 'crimson_planks',
                warped_stem: 'warped_planks',
                crimson_hyphae: 'crimson_planks',
                warped_hyphae: 'warped_planks'
            };

            const availablePlanks = new Set(
                inventoryItems
                    .map(item => plankByWood[item?.name] || null)
                    .filter(Boolean)
            );
            const hasWoodSource = availablePlanks.size > 0;

            if (!hasWoodSource) {
                return {
                    success: false,
                    action: 'craft_first_available',
                    error: 'No wood source in inventory for plank crafting'
                };
            }

            // Prioritize plank variants that match existing wood to avoid noisy recipe retries.
            const matchingCandidates = candidates.filter(name => availablePlanks.has(name));
            if (matchingCandidates.length > 0) {
                prioritizedCandidates = [...matchingCandidates];
            }
        }

        let attempts = 0;
        let lastError = 'No craft candidate succeeded';
        for (const itemName of prioritizedCandidates) {
            const targetCount = Math.max(1, Number(count) || 1);
            const requestedCounts = [...new Set([targetCount, Math.ceil(targetCount / 2), 1])];
            for (const reqCount of requestedCounts) {
                attempts++;
                const result = await this.craft(itemName, reqCount, options);
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

    async ensure_offhand(params = {}) {
        const bot = this._getBot();
        const normalizedParams = typeof params === 'string' ? { itemName: params } : (params || {});
        const effective = this._applyPolicy('ensure_offhand', normalizedParams);
        const { itemName } = effective;
        if (!itemName) {
            return { success: false, action: 'ensure_offhand', error: 'Missing item name' };
        }

        const offhandSlot = bot.getEquipmentDestSlot('off-hand');
        const current = bot.inventory.slots[offhandSlot];
        if (current?.name === itemName) {
            return { success: true, action: 'ensure_offhand', item: itemName, alreadyEquipped: true };
        }

        const target = bot.inventory.items().find(i => i.name === itemName);
        if (!target) {
            return { success: false, action: 'ensure_offhand', error: `Missing item in inventory: ${itemName}` };
        }

        try {
            await bot.equip(target, 'off-hand');
            return { success: true, action: 'ensure_offhand', item: itemName };
        } catch (error) {
            return { success: false, action: 'ensure_offhand', error: error.message };
        }
    }

    async enforce_combat_posture(params = {}) {
        const bot = this._getBot();
        const effective = this._applyPolicy('enforce_combat_posture', params);
        const { shield = true, totemThreshold = 10 } = effective;

        const hp = bot.health ?? 20;
        if (hp <= totemThreshold) {
            const totemResult = await this.ensure_offhand({ itemName: 'totem_of_undying' });
            if (totemResult.success) {
                return { success: true, action: 'enforce_combat_posture', mode: 'totem', health: hp };
            }
        }

        if (shield) {
            const shieldResult = await this.ensure_offhand({ itemName: 'shield' });
            if (shieldResult.success) {
                return { success: true, action: 'enforce_combat_posture', mode: 'shield', health: hp };
            }
        }

        return { success: false, action: 'enforce_combat_posture', error: 'No valid offhand posture item available', health: hp };
    }

    async hold_position(params = {}) {
        const effective = this._applyPolicy('hold_position', params);
        const { x, y, z, radius = 3, duration = 2000 } = effective;
        const bot = this._getBot();

        if (![x, y, z].every(v => typeof v === 'number')) {
            return { success: false, action: 'hold_position', error: 'Missing target coordinates' };
        }

        const target = { x, y, z };
        const dist = bot.entity?.position?.distanceTo
            ? bot.entity.position.distanceTo(target)
            : Infinity;

        if (dist > radius) {
            const moveResult = await this.moveto({
                position: target,
                options: {
                    minDistance: Math.max(1, Math.min(radius, 3)),
                    timeoutMs: 20000,
                    retries: 1
                }
            });
            if (!moveResult.success) {
                return {
                    success: false,
                    action: 'hold_position',
                    error: moveResult.error || 'Failed to move to hold position'
                };
            }
        }

        await new Promise(resolve => setTimeout(resolve, Math.max(200, duration)));
        return { success: true, action: 'hold_position', radius, duration };
    }

    async move_to(position, options = {}) {
        return this.moveto({ position, options });
    }

    async craft_first_available(itemCandidates = [], count = 1, options = {}) {
        return this.craftfirstavailable(itemCandidates, count, options);
    }

    async ensureItem(itemName, targetCount = 1, options = {}) {
        return this.ensure_item(itemName, targetCount, options);
    }

    async eatIfHungry(params = {}, options = {}) {
        return this.eat_if_hungry(params, options);
    }

    async moveTo(params = {}, options = {}) {
        return this.moveto(params, options);
    }

    async craftFirstAvailable(params = [], count = 1, options = {}) {
        return this.craftfirstavailable(params, count, options);
    }

    async gatherNearby(matching, count = 1, options = {}) {
        return this.gather_nearby(matching, count, options);
    }

    _getBot() {
        if (!this.agent?.bot) {
            throw new Error('ActionAPI: Bot instance not available. Agent may be booting or disconnected.');
        }
        return this.agent.bot;
    }

    // ── Runtime Parameter Overrides (set by EvolutionEngine) ──
    _parameterOverrides = new Map();

    /**
     * Set runtime overrides for an action (called by EvolutionEngine).
     * @param {string} actionName
     * @param {object} overrides - { retries, baseDelay, maxDistance, moveTimeoutMs, ... }
     */
    setOverride(actionName, overrides) {
        const existing = this._parameterOverrides.get(actionName) || {};
        this._parameterOverrides.set(actionName, { ...existing, ...overrides });
        console.log(`[ActionAPI] 🧬 Override set for '${actionName}': ${JSON.stringify(this._parameterOverrides.get(actionName))}`);
    }

    /**
     * Get current overrides for an action.
     */
    getOverride(actionName) {
        return this._parameterOverrides.get(actionName) || {};
    }

    _applyPolicy(actionName, params = {}) {
        if (!this.agent?.behaviorRuleEngine || typeof this.agent.behaviorRuleEngine.applyActionPolicy !== 'function') {
            return params;
        }

        try {
            return this.agent.behaviorRuleEngine.applyActionPolicy(actionName, params);
        } catch (error) {
            console.warn(`[ActionAPI] Policy rejected action '${actionName}': ${error.message}`);
            return params;
        }
    }

    _normalizeOptionsPayload(payload = {}, keepTopLevel = []) {
        const output = (payload && typeof payload === 'object' && !Array.isArray(payload))
            ? { ...payload }
            : {};

        const optionKeys = [
            'retries',
            'baseDelay',
            'timeoutMs',
            'maxDistance',
            'moveTimeoutMs',
            'moveRetries',
            'minDistance',
            'maxSearchAttempts',
            'reachDistance',
            'continueOnError',
            'collectDrops',
            'executor',
            'placeOn',
            'dontCheat'
        ];

        const existingOptions = (output.options && typeof output.options === 'object' && !Array.isArray(output.options))
            ? { ...output.options }
            : {};

        for (const key of optionKeys) {
            if (Object.prototype.hasOwnProperty.call(output, key)) {
                if (existingOptions[key] === undefined) {
                    existingOptions[key] = output[key];
                }
                if (!keepTopLevel.includes(key)) {
                    delete output[key];
                }
            }
        }

        output.options = existingOptions;
        return output;
    }

    _countItem(bot, itemName) {
        if (!itemName) return 0;
        return bot.inventory.items()
            .filter(i => i.name === itemName)
            .reduce((sum, i) => sum + i.count, 0);
    }

    async _runWithRetry(action, executor, retries = 2, baseDelay = 250) {
        // Apply EvolutionEngine overrides if available
        const overrides = this.getOverride(action);
        const effectiveRetries = overrides.retries ?? retries;
        const effectiveBaseDelay = overrides.baseDelay ?? baseDelay;

        let attempts = 0;
        const startTime = Date.now();
        try {
            await RetryHelper.retry(
                async () => {
                    attempts++;
                    return await executor();
                },
                {
                    context: `ActionAPI:${action}`,
                    maxRetries: effectiveRetries,
                    baseDelay: effectiveBaseDelay,
                    maxDelay: 2000
                }
            );

            const duration = Date.now() - startTime;
            if (this.agent?.evolution) {
                this.agent.evolution.recordActionOutcome(action, {}, { success: true, duration });
            }

            return {
                success: true,
                action,
                attempts,
                retriesUsed: Math.max(0, attempts - 1),
                duration
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            if (this.agent?.evolution) {
                this.agent.evolution.recordActionOutcome(action, {}, { success: false, duration, error: error.message });
            }

            return {
                success: false,
                action,
                attempts,
                error: error.message,
                duration
            };
        }
    }
    async advance_strategy(params = {}) {
        const { reason } = params;
        console.log(`[ActionAPI] 🧠 Brain requested strategy advancement: ${reason || 'Task Complete'}`);

        if (this.agent.missionDirector && this.agent.missionDirector.strategyRunner) {
            const advanced = this.agent.missionDirector.strategyRunner.advanceStep();
            return {
                success: advanced,
                action: 'advance_strategy',
                reason,
                newStep: this.agent.missionDirector.strategyRunner.getCurrentInstruction()
            };
        } else {
            return { success: false, action: 'advance_strategy', error: 'StrategyRunner not available' };
        }
    }

    async request_new_tool(params = {}) {
        const { description, reason } = typeof params === 'string' ? { description: params } : params;

        if (!description) {
            return { success: false, action: 'request_new_tool', error: 'Missing tool description' };
        }

        console.log(`[ActionAPI] 🧠 Brain requested new tool: ${description}`);
        // Dynamic import to avoid circular dependency if SignalBus imports ActionAPI (unlikely but safe)
        const { globalBus, SIGNAL } = await import('./SignalBus.js');

        globalBus.emitSignal(SIGNAL.TOOL_NEEDED, {
            desc: description,
            reason: reason || 'Brain request',
            timestamp: Date.now()
        });

        return {
            success: true,
            action: 'request_new_tool',
            status: 'queued',
            message: 'Tool creation request sent. Check back available actions later.'
        };
    }
}

export default ActionAPI;
