import fs from 'fs';
import path from 'path';
import { MissionDirector } from '../../src/agent/core/MissionDirector.js';

function assertTrue(name, condition) {
    if (!condition) throw new Error(name);
    console.log(`PASS ${name}`);
}

const mem = new Map();
const agentName = `mission_test_${Date.now()}`;
let scheduledTasks = 0;
const agent = {
    name: agentName,
    running: true,
    state: 'ready',
    bot: {
        entity: {
            position: { x: 0, y: 64, z: 0 }
        },
        food: 20,
        inventory: {
            items: () => [{ name: 'wooden_pickaxe', count: 1 }]
        }
    },
    memory: {
        getPlace(key) { return mem.get(key) || null; },
        setPlace(key, value) { mem.set(key, value); }
    },
    actionAPI: {
        gather_nearby: async () => ({ success: true }),
        craftfirstavailable: async () => ({ success: true }),
        ensure_item: async () => ({ success: true }),
        ensure_offhand: async () => ({ success: true }),
        eat_if_hungry: async () => ({ success: true }),
        collect_drops: async () => ({ success: true }),
        smelt: async () => ({ success: true }),
        moveto: async () => ({ success: true }),
        hold_position: async () => ({ success: true })
    },
    scheduler: {
        schedule(name, priority, taskFn) {
            scheduledTasks += 1;
            void taskFn({ signal: null });
            return { name, priority };
        }
    },
    combatReflex: {
        findNearbyHostiles: () => []
    }
};

const director = new MissionDirector(agent);
director.init();

await director.tick();
assertTrue('phase left bootstrap', director.phase !== 'BOOTSTRAP');
assertTrue('spawn anchor saved', !!mem.get('spawn_anchor'));
assertTrue('roadmap-only mode does not dispatch survival tasks', scheduledTasks === 0);

const progressPath = path.resolve(process.cwd(), 'bots', agentName, 'mission_progress.json');
assertTrue('mission progress file created', fs.existsSync(progressPath));

director.cleanup();
console.log('MissionDirector tests passed.');
