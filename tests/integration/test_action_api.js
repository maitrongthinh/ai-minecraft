import { ActionAPI } from '../../src/agent/core/ActionAPI.js';

function assertOrThrow(label, condition) {
    if (!condition) {
        throw new Error(label);
    }
    console.log(`PASS ${label}`);
}

async function run() {
    const mockBot = {
        version: '1.20.4',
        digCalls: 0,
        craftCalls: 0,
        dig: () => {
            mockBot.digCalls++;
            if (mockBot.digCalls < 3) {
                return Promise.reject(new Error('temporary dig failure'));
            }
            return Promise.resolve();
        },
        findBlock: () => null,
        recipesFor: () => ([{}]),
        craft: () => {
            mockBot.craftCalls++;
            if (mockBot.craftCalls < 2) {
                return Promise.reject(new Error('temporary craft failure'));
            }
            return Promise.resolve();
        }
    };

    const api = new ActionAPI({ bot: mockBot });

    const mineResult = await api.mine({ name: 'stone' }, { retries: 3, baseDelay: 1 });
    assertOrThrow('mine succeeds with retries', mineResult.success === true);
    assertOrThrow('mine retries at least twice', mineResult.retriesUsed >= 2);

    const craftResult = await api.craft('stick', 1, { retries: 2, baseDelay: 1 });
    assertOrThrow('craft succeeds with retries', craftResult.success === true);
    assertOrThrow('craft retries at least once', craftResult.retriesUsed >= 1);

    let placeAttempts = 0;
    const placeResult = await api.place('cobblestone', { x: 1, y: 64, z: 1 }, {
        retries: 2,
        baseDelay: 1,
        executor: async () => {
            placeAttempts++;
            if (placeAttempts < 2) {
                throw new Error('temporary place failure');
            }
        }
    });
    assertOrThrow('place succeeds with retries', placeResult.success === true);
    assertOrThrow('place retries at least once', placeResult.retriesUsed >= 1);

    let smeltAttempts = 0;
    const smeltResult = await api.smelt('raw_iron', 1, {
        retries: 2,
        baseDelay: 1,
        executor: async () => {
            smeltAttempts++;
            if (smeltAttempts < 2) {
                throw new Error('temporary smelt failure');
            }
        }
    });
    assertOrThrow('smelt succeeds with retries', smeltResult.success === true);
    assertOrThrow('smelt retries at least once', smeltResult.retriesUsed >= 1);

    let moveAttempts = 0;
    const moveResult = await api.moveTo({ x: 5, y: 64, z: 5 }, {
        retries: 2,
        baseDelay: 1,
        executor: async () => {
            moveAttempts++;
            if (moveAttempts < 2) throw new Error('temporary move failure');
        }
    });
    assertOrThrow('moveTo succeeds with retries', moveResult.success === true);
    assertOrThrow('moveTo retries at least once', moveResult.retriesUsed >= 1);

    const originalCraft = api.craft.bind(api);
    api.craft = async (itemName) => {
        if (itemName === 'birch_planks') {
            return { success: true, action: 'craft', attempts: 1, retriesUsed: 0 };
        }
        return { success: false, action: 'craft', attempts: 1, error: 'no recipe' };
    };
    const craftAny = await api.craftFirstAvailable(['oak_planks', 'birch_planks'], 4);
    assertOrThrow('craftFirstAvailable succeeds on fallback candidate', craftAny.success === true);
    assertOrThrow('craftFirstAvailable returns crafted item name', craftAny.craftedItem === 'birch_planks');
    api.craft = originalCraft;

    let sticks = 0;
    const ensureBot = {
        version: '1.20.4',
        inventory: {
            items: () => sticks > 0 ? [{ name: 'stick', count: sticks }] : []
        }
    };
    const ensureApi = new ActionAPI({ bot: ensureBot });
    ensureApi.craft = async () => {
        sticks = 2;
        return { success: true, action: 'craft', attempts: 1, retriesUsed: 0 };
    };
    const ensureResult = await ensureApi.ensureItem('stick', 2);
    assertOrThrow('ensureItem crafts missing items', ensureResult.success === true);
    assertOrThrow('ensureItem reaches target quantity', ensureResult.count >= 2);

    const eatBot = {
        version: '1.20.4',
        food: 10,
        inventory: {
            items: () => [{ name: 'apple', count: 1 }]
        },
        equip: async () => { },
        consume: async () => { eatBot.food = 18; }
    };
    const eatApi = new ActionAPI({ bot: eatBot });
    const eatResult = await eatApi.eatIfHungry({ threshold: 14, retries: 1, baseDelay: 1 });
    assertOrThrow('eatIfHungry succeeds when food is available', eatResult.success === true);
    assertOrThrow('eatIfHungry increases food level', eatResult.food >= 14);

    let blockFound = 0;
    const gatherBot = {
        version: '1.20.4',
        entity: {
            position: { distanceTo: () => 0 }
        },
        inventory: {
            items: () => []
        },
        findBlock: () => {
            if (blockFound === 0) {
                blockFound++;
                return { name: 'oak_log', type: 1 };
            }
            return null;
        }
    };
    const gatherApi = new ActionAPI({ bot: gatherBot });
    gatherApi.mine = async () => ({ success: true, action: 'mine', attempts: 1, retriesUsed: 0 });
    const gatherResult = await gatherApi.gatherNearby('log', 1);
    assertOrThrow('gatherNearby succeeds with matching block', gatherResult.success === true);
    assertOrThrow('gatherNearby reports gathered count', gatherResult.gathered === 1);

    console.log('All ActionAPI retry tests passed.');
}

run()
    .then(() => globalThis.process.exit(0))
    .catch((error) => {
        console.error('FAIL', error.message);
        globalThis.process.exit(1);
    });
