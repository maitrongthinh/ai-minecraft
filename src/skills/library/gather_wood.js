import { RetryHelper } from '../../utils/RetryHelper.js';
import { goToPosition } from './movement_skills.js';

export const metadata = {
    name: 'gather_wood',
    description: 'Gathers nearby log blocks with retry protection',
    parameters: {
        type: 'object',
        properties: {
            count: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                default: 8
            },
            maxDistance: {
                type: 'number',
                minimum: 4,
                maximum: 128,
                default: 32
            },
            retries: {
                type: 'number',
                minimum: 0,
                maximum: 5,
                default: 1
            },
            maxPerRun: {
                type: 'number',
                minimum: 1,
                maximum: 16,
                default: 3
            },
            maxRuntimeMs: {
                type: 'number',
                minimum: 5000,
                maximum: 300000,
                default: 45000
            },
            moveTimeoutMs: {
                type: 'number',
                minimum: 1000,
                maximum: 60000,
                default: 18000
            },
            digTimeoutMs: {
                type: 'number',
                minimum: 1000,
                maximum: 60000,
                default: 15000
            },
            maxVerticalDelta: {
                type: 'number',
                minimum: 1,
                maximum: 32,
                default: 8
            }
        },
        required: []
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            gathered: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['survival', 'gathering', 'wood']
};

export default async function execute(agent, params = {}) {
    const {
        count = 8,
        maxDistance = 32,
        retries = 1,
        maxPerRun = 3,
        maxRuntimeMs = 45000,
        moveTimeoutMs = 18000,
        digTimeoutMs = 15000,
        maxVerticalDelta = 8,
        scanCount = 48
    } = params;
    const bot = agent?.bot || agent;
    if (!bot) {
        return { success: false, gathered: 0, message: 'Bot not initialized' };
    }
    const targetCount = Math.max(1, Math.min(count, maxPerRun));
    const startedAt = Date.now();
    const blockedTargets = new Set();

    const toKey = (pos) => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    const isLogBlock = (block) => {
        const name = block?.name || '';
        return name.includes('_log') || name.endsWith('_stem') || name.endsWith('_hyphae');
    };
    const isPassable = (block) => {
        if (!block) return true;
        if (block.boundingBox === 'empty') return true;
        return (
            block.name === 'air' ||
            block.name === 'cave_air' ||
            block.name === 'void_air' ||
            block.name === 'grass' ||
            block.name === 'tall_grass' ||
            block.name === 'fern' ||
            block.name === 'large_fern' ||
            block.name === 'snow'
        );
    };
    const hasStandableAdjacent = (block) => {
        const offsets = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];
        for (const [dx, dz] of offsets) {
            const feet = bot.blockAt(block.position.offset(dx, 0, dz));
            const head = bot.blockAt(block.position.offset(dx, 1, dz));
            const ground = bot.blockAt(block.position.offset(dx, -1, dz));
            if (isPassable(feet) && isPassable(head) && ground && ground.boundingBox === 'block') {
                return true;
            }
        }
        return false;
    };
    const countLogInventory = () =>
        bot.inventory.items()
            .filter(item => item?.name?.includes('_log') || item?.name?.endsWith('_stem') || item?.name?.endsWith('_hyphae'))
            .reduce((sum, item) => sum + (item.count || 0), 0);
    const initialLogCount = countLogInventory();

    const withTimeout = (promise, timeoutMs, label) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
    ]);

    const selectNextLog = () => {
        const positions = bot.findBlocks({
            matching: (block) => isLogBlock(block),
            maxDistance,
            count: scanCount
        });
        if (!positions || positions.length === 0) {
            return null;
        }

        const origin = bot.entity.position;
        const candidates = [];

        for (const pos of positions) {
            const key = toKey(pos);
            if (blockedTargets.has(key)) continue;

            const block = bot.blockAt(pos);
            if (!isLogBlock(block)) {
                blockedTargets.add(key);
                continue;
            }

            const verticalDelta = Math.abs(block.position.y - origin.y);
            if (verticalDelta > maxVerticalDelta) {
                blockedTargets.add(key);
                continue;
            }

            const below = bot.blockAt(block.position.offset(0, -1, 0));
            const isTreeBase = below && !isLogBlock(below);
            const standable = hasStandableAdjacent(block);
            const distance = origin.distanceTo(block.position);

            // Prefer low, near, standable, base trunk logs first.
            const score =
                distance +
                verticalDelta * 1.8 +
                (standable ? 0 : 3) +
                (isTreeBase ? -0.8 : 0);

            candidates.push({ block, key, score });
        }

        if (candidates.length === 0) {
            return null;
        }

        candidates.sort((a, b) => a.score - b.score);
        return candidates[0];
    };

    const scoutForLogs = async () => {
        const origin = bot.entity.position.floored();
        const scoutRadii = [
            Math.max(8, Math.floor(maxDistance * 0.5)),
            Math.max(12, maxDistance),
            Math.min(96, maxDistance + 24)
        ];
        const directions = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [-1, 1], [1, -1], [-1, -1]
        ];

        for (const radius of scoutRadii) {
            for (const [dx, dz] of directions) {
                if (Date.now() - startedAt >= maxRuntimeMs) return false;

                const tx = origin.x + dx * radius;
                const tz = origin.z + dz * radius;
                const ty = bot.entity.position.y;
                try {
                    await withTimeout(
                        goToPosition(bot, tx, ty, tz, 2),
                        Math.min(moveTimeoutMs, 15000),
                        'scoutMove'
                    );
                } catch {
                    // Continue scouting other directions.
                }

                if (selectNextLog()) {
                    return true;
                }
            }
        }

        return false;
    };

    const mineOneLog = async (targetPos) => {
        let latest = bot.blockAt(targetPos);
        if (!latest || !isLogBlock(latest)) {
            throw new Error(`Target log disappeared at ${targetPos.x},${targetPos.y},${targetPos.z}`);
        }

        const distance = bot.entity.position.distanceTo(latest.position);
        if (distance > 4.5) {
            const moved = await withTimeout(
                goToPosition(bot, latest.position.x, latest.position.y, latest.position.z, 2),
                moveTimeoutMs,
                'goToPosition'
            );
            if (!moved) {
                throw new Error(`Cannot reach log at ${latest.position.x},${latest.position.y},${latest.position.z}`);
            }
            latest = bot.blockAt(targetPos);
            if (!latest || !isLogBlock(latest)) {
                throw new Error(`Target log disappeared at ${targetPos.x},${targetPos.y},${targetPos.z}`);
            }
        }

        const reachDistance = bot.entity.position.distanceTo(latest.position);
        if (reachDistance > 4.8) {
            throw new Error(`Log out of reach (${reachDistance.toFixed(2)})`);
        }

        if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(latest)) {
            throw new Error(`Cannot dig log at ${latest.position.x},${latest.position.y},${latest.position.z}`);
        }

        await withTimeout(bot.dig(latest, true), digTimeoutMs, 'dig');
        await new Promise(resolve => setTimeout(resolve, 250));
        if (agent.actionAPI) {
            await agent.actionAPI.collectDroppedItems({
                radius: 6,
                maxItems: 2,
                retries: 0,
                continueOnError: true
            });
        }
    };

    let mined = 0;
    for (let i = 0; i < targetCount; i++) {
        if (Date.now() - startedAt >= maxRuntimeMs) {
            const gathered = Math.max(0, countLogInventory() - initialLogCount);
            return {
                success: gathered > 0,
                gathered,
                message: `Gathered ${gathered}/${targetCount} logs (safety timeout ${maxRuntimeMs}ms)`
            };
        }

        let target = selectNextLog();
        if (!target) {
            const foundAfterScout = await scoutForLogs();
            if (!foundAfterScout) {
                break;
            }
            target = selectNextLog();
            if (!target) {
                break;
            }
        }

        try {
            if (agent.actionAPI) {
                const mineResult = await agent.actionAPI.mine(target.block, {
                    retries,
                    executor: async () => mineOneLog(target.block.position)
                });
                if (!mineResult.success) {
                    throw new Error(mineResult.error || 'mine failed');
                }
            } else {
                await RetryHelper.retry(
                    async () => mineOneLog(target.block.position),
                    {
                        context: 'gather_wood',
                        maxRetries: retries,
                        baseDelay: 250,
                        maxDelay: 1000
                    }
                );
            }
            mined++;
        } catch (error) {
            blockedTargets.add(target.key);
            const errorMsg = String(error?.message || '').toLowerCase();
            if (
                errorMsg.includes('timed out') ||
                errorMsg.includes('cannot reach') ||
                errorMsg.includes('out of reach') ||
                errorMsg.includes('cannot dig')
            ) {
                continue;
            }
            const gathered = Math.max(0, countLogInventory() - initialLogCount);
            return {
                success: gathered > 0,
                gathered,
                message: `Gathered ${gathered}/${targetCount} logs (${error.message})`
            };
        }
    }

    const gathered = Math.max(mined, Math.max(0, countLogInventory() - initialLogCount));
    return {
        success: gathered > 0,
        gathered,
        message: `Gathered ${gathered} log block(s) this run`
    };
}
