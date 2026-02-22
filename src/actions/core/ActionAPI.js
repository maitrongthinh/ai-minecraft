import minecraftData from 'minecraft-data';
import Vec3 from 'vec3';
import { RetryHelper } from '../../utils/RetryHelper.js';
import { placeBlock as placeBlockSkill } from '../../skills/library/interaction_skills.js';
import { smeltItem as smeltItemSkill, craftRecipe as craftRecipeSkill } from '../../skills/library/crafting_skills.js';
import { MotorCortex } from '../../agent/core/MotorCortex.js';

/**
 * ActionAPI
 *
 * Unified, retry-aware primitive actions used by higher-level systems.
 * Keeps survival-critical mechanics deterministic and reusable.
 */
export class ActionAPI {
    constructor(agent) {
        this.agent = agent;
        this.motorCortex = agent.motorCortex; // Use shared MotorCortex from agent
    }

    /**
     * JSON-RPC Dispatcher
     * @param {Object} directive - { type: string, params: Object, action_id: string }
     */
    async dispatch(directive) {
        let { type, params, action_id } = directive;
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

        // Bridge Compatibility: If params is an array (from sandbox), map to object for known primitives
        if (Array.isArray(params)) {
            const t = type.toLowerCase();
            if (t === 'gather_nearby') params = { matching: params[0], count: params[1], options: params[2] || {} };
            else if (t === 'ensure_item') params = { itemName: params[0], targetCount: params[1], options: params[2] || {} };
            else if (t === 'eat_if_hungry') params = { threshold: params[0], options: params[1] || {} };
            else if (t === 'mine') params = { target: params[0], options: params[1] || {} };
            else if (t === 'craft') params = { item: params[0], count: params[1], options: params[2] || {} };
            else if (t === 'place') params = { block: params[0], pos: params[1], options: params[2] || {} };
            else if (t === 'move_to') params = { pos: params[0], options: params[1] || {} };
            else if (t === 'attack') params = { entity: params[0], options: params[1] || {} };
            else if (t === 'equip') params = { item: params[0], dest: params[1], options: params[2] || {} };
            else if (t === 'smelt') params = { item: params[0], count: params[1], options: params[2] || {} };
            else if (params.length === 1 && typeof params[0] === 'object') params = params[0];
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
        const skillLib = this.agent.skillLibrary || this.agent.skill_library;
        if (skillLib) {
            const skill = typeof skillLib.getSkill === 'function' ? skillLib.getSkill(type) : null;
            if (skill) {
                // Execute skill in sandbox or directly
                console.log(`[ActionAPI] 🧠 Calling skill: ${type}`);
                const codeToRun = `await ${type}(bot, ...${JSON.stringify(params)})`;
                const result = await this.agent.intelligence.execute(codeToRun);
                return { action_id, ...result };
            }
        }

        return { action_id, success: false, error: `Unknown action type: ${type}` };
    }

    /**
     * Execute a Chain of Actions (v3.1)
     * Handles variable interpolation, conditionals, and mixed-mode execution.
     * @param {Array} chain - List of chain steps
     */
    async executeChain(chain, context = {}) {
        const results = [];
        const localMemory = { ...context }; // Local variables for this chain

        console.log(`[ActionAPI] ⛓️ Executing Action Chain (${chain.length} steps)`);

        for (const step of chain) {
            // 1. Resolve Variables in Params
            const resolvedParams = this.resolveDeep(step.params || {}, localMemory);

            // 2. Check Conditionals (if present)
            if (step.if) {
                const shouldExecute = this.evaluateCondition(step.if, localMemory);
                if (!shouldExecute) {
                    console.log(`[ActionAPI] ⏭️ Skipping step ${step.id} (Condition false)`);
                    continue;
                }
            }

            let result = { success: true };

            try {
                // 3. Execute based on Type
                switch (step.type) {
                    case 'ACTION_API':
                        // Call this API directly
                        const actionName = step.name.toLowerCase();
                        if (typeof this[actionName] === 'function') {
                            result = await this[actionName](resolvedParams);
                        } else {
                            result = await this.dispatch({ type: step.name, params: resolvedParams, action_id: step.id });
                        }
                        break;

                    case 'MCP_TOOL':
                        // Call ToolRegistry (if available)
                        if (this.agent.toolRegistry) {
                            result = await this.agent.toolRegistry.executeTool(step.name, resolvedParams);
                        } else {
                            // Fallback to old skill system or error
                            result = { success: false, error: "ToolRegistry not found" };
                        }
                        break;

                    case 'BLACKBOARD_OP':
                        // Direct Memory Operation
                        const bb = this.agent.scheduler?.blackboard;
                        if (bb) {
                            if (step.op === 'write') {
                                bb.set(step.key, resolvedParams.value, 'ACTION_CHAIN');
                            } else if (step.op === 'read') {
                                result.data = bb.get(step.key);
                            }
                        }
                        break;

                    case 'WAIT':
                        await new Promise(r => setTimeout(r, resolvedParams.ms || 1000));
                        break;
                }
            } catch (error) {
                result = { success: false, error: error.message };
                console.error(`[ActionAPI] ❌ Step ${step.id} Failed:`, error.message);
            }

            // 4. Store Result if requested
            if (step.store_as) {
                localMemory[step.store_as] = result.data || result;
            }

            // 5. Handle Failure
            if (!result.success && !step.ignore_failure) {
                console.warn(`[ActionAPI] 🛑 Chain Halted at ${step.id}`);
                return { success: false, stage: step.id, error: result.error, history: results };
            }

            results.push({ id: step.id, success: result.success, data: result.data });
        }

        return { success: true, history: results };
    }

    /**
     * Recursive variable resolver
     * Replaces ${var} with value from LocalMemory or Blackboard
     */
    resolveDeep(obj, localMemory) {
        if (typeof obj === 'string') {
            return this.resolveVariable(obj, localMemory);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.resolveDeep(item, localMemory));
        }
        if (typeof obj === 'object' && obj !== null) {
            const resolved = {};
            for (const key in obj) {
                resolved[key] = this.resolveDeep(obj[key], localMemory);
            }
            return resolved;
        }
        return obj;
    }

    resolveVariable(str, localMemory) {
        if (!str.startsWith('${') || !str.endsWith('}')) return str;

        const key = str.slice(2, -1); // Remove ${ and }

        // 1. Check Local Memory (Chain Variables)
        if (localMemory[key] !== undefined) return localMemory[key];

        // 2. Check Blackboard (Global State)
        const bb = this.agent.scheduler?.blackboard;
        if (bb && key.startsWith('BB.')) {
            return bb.get(key.replace('BB.', ''));
        }

        return str; // Return original if not found
    }

    evaluateCondition(condition, localMemory) {
        const lhs = this.resolveDeep(condition.lhs, localMemory);
        const rhs = this.resolveDeep(condition.rhs, localMemory);

        switch (condition.op) {
            case '==': return lhs == rhs;
            case '!=': return lhs != rhs;
            case '>': return lhs > rhs;
            case '<': return lhs < rhs;
            case '>=': return lhs >= rhs;
            case '<=': return lhs <= rhs;
            case 'contains': return Array.isArray(lhs) && lhs.includes(rhs);
            default: return false;
        }
    }

    async humanlook(params) {
        const { position, urgency } = params;
        return await this.motorCortex.humanLook(position, urgency || 1.0);
    }

    async mine(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['targetBlock']);
        const effective = this._applyPolicy('mine', normalizedParams);
        const { targetBlock, options = {} } = effective;

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

    async craft(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName', 'count']);
        const effective = this._applyPolicy('craft', normalizedParams);
        const { itemName, count = 1, options = {} } = effective;

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

    async place(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['blockType', 'position']);
        const effective = this._applyPolicy('place', normalizedParams);
        const { blockType, position, options = {} } = effective;

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

    async smelt(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName', 'count']);
        const effective = this._applyPolicy('smelt', normalizedParams);
        const { itemName, count = 1, options = {} } = effective;

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

    async moveto(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['position']);
        const effective = this._applyPolicy('move_to', normalizedParams);
        const { position, options = {} } = effective;

        const bot = this._getBot();
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
            return { success: false, action: 'move_to', error: 'Missing valid target position' };
        }

        const executor = options.executor || (async () => {
            const { goToPosition } = await import('../../skills/library/go_to.js');
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

    async gather_nearby(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['matching', 'count']);
        const effective = this._applyPolicy('gather_nearby', normalizedParams);
        const { matching, count = 1, options = {} } = effective;

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
        // ... (existing logic remains mostly the same, just clean structure)

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

    async ensure_item(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName', 'targetCount']);
        const effective = this._applyPolicy('ensure_item', normalizedParams);
        const { itemName, targetCount = 1, options = {} } = effective;

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
        } else if (this._isTool(itemName)) {
            // Smart Tool Crafting: Check for sticks and base material
            await this._ensureToolMaterials(itemName, options);
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
            }
        }
    }

    async collect_drops(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['radius', 'maxItems']);
        const effective = this._applyPolicy('collect_drops', normalizedParams);
        const { radius = 8, maxItems = 6, options = {} } = effective;

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

    /**
     * Primitive: Eat specific item or best food
     * @param {object} params { itemName: string, options: {} }
     */
    async eat(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName']);
        const effective = this._applyPolicy('eat', normalizedParams);
        const { itemName, options = {} } = effective;
        const bot = this._getBot();

        let foodItem;
        const data = minecraftData(bot.version);

        if (itemName) {
            foodItem = bot.inventory.items().find(i => i.name === itemName);
        } else {
            // Auto-select best food
            foodItem = bot.inventory.items()
                .filter(i => data.foodsByName?.[i.name])
                .sort((a, b) => (data.foodsByName[b.name].foodPoints - data.foodsByName[a.name].foodPoints))[0];
        }

        if (!foodItem) {
            return { success: false, action: 'eat', error: itemName ? `Food ${itemName} not found` : 'No food found' };
        }

        const executor = options.executor || (async () => {
            await bot.equip(foodItem, 'hand');
            await bot.consume();
        });

        return await this._runWithRetry('eat', executor, options.retries ?? 1, options.baseDelay ?? 250);
    }

    /**
     * Primitive: Equip item to slot
     * @param {object} params { itemName: string, slot: 'hand'|'head'|'torso'|'legs'|'feet'|'off-hand', options: {} }
     */
    async equip(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName', 'slot']);
        const effective = this._applyPolicy('equip', normalizedParams);
        const { itemName, slot = 'hand', options = {} } = effective;
        const bot = this._getBot();

        if (!itemName) return { success: false, action: 'equip', error: 'Missing itemName' };

        const item = bot.inventory.items().find(i => i.name === itemName);
        if (!item) return { success: false, action: 'equip', error: `Item ${itemName} not in inventory` };

        const executor = options.executor || (async () => {
            await bot.equip(item, slot);
        });

        return await this._runWithRetry('equip', executor, options.retries ?? 1, options.baseDelay ?? 250);
    }

    /**
     * Primitive: Attack entity
     * @param {object} params { entity: Entity, entityName: string, options: {} }
     */
    async attack(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['entity', 'entityName']);
        const effective = this._applyPolicy('attack', normalizedParams);
        const { entity, entityName, options = {} } = effective;
        const bot = this._getBot();

        let target = entity;
        if (!target && entityName) {
            target = bot.nearestEntity(e => e.name === entityName && bot.entity.position.distanceTo(e.position) < 4);
        }

        if (!target) return { success: false, action: 'attack', error: 'Target not found' };

        const executor = options.executor || (async () => {
            if (this.motorCortex) {
                await this.motorCortex.humanLook(target.position.offset(0, target.height / 2, 0), 1.5);
            }
            bot.attack(target);
        });

        return await this._runWithRetry('attack', executor, options.retries ?? 1, options.baseDelay ?? 400);
    }

    // Deprecated: Use eat() instead
    async eat_if_hungry(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['threshold']);
        const effective = this._applyPolicy('eat_if_hungry', normalizedParams);
        const { threshold = 14, options = {} } = effective;

        const bot = this._getBot();
        if (bot.food >= threshold) {
            return { success: true, action: 'eat_if_hungry', skipped: true, food: bot.food };
        }

        return await this.eat({ options });
    }

    async craftfirstavailable(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemCandidates', 'count']);
        const effective = this._applyPolicy('craft_first_available', normalizedParams);
        const { itemCandidates = [], count = 1, options = {} } = effective;

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

    async ensure_offhand(params = {}) {
        const normalizedParams = this._normalizeOptionsPayload(params, ['itemName']);
        const effective = this._applyPolicy('ensure_offhand', normalizedParams);
        const { itemName } = effective;
        const bot = this._getBot();

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
        const effective = this._applyPolicy('enforce_combat_posture', params);
        const { shield = true, totemThreshold = 10 } = effective;
        const bot = this._getBot();

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

    // ── Legacy Aliases (Adapters) ──

    async move_to(position, options = {}) {
        return this.moveto({ position, options });
    }

    async craft_first_available(itemCandidates = [], count = 1, options = {}) {
        return this.craftfirstavailable({ itemCandidates, count, options });
    }

    async ensureItem(itemName, targetCount = 1, options = {}) {
        return this.ensure_item({ itemName, targetCount, options });
    }

    async eatIfHungry(threshold = 14, options = {}) {
        return this.eat_if_hungry({ threshold, options });
    }

    async moveTo(position, options = {}) {
        return this.moveto({ position, options });
    }

    async craftFirstAvailable(itemCandidates = [], count = 1, options = {}) {
        return this.craftfirstavailable({ itemCandidates, count, options });
    }

    async gatherNearby(matching, count = 1, options = {}) {
        return this.gather_nearby({ matching, count, options });
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
