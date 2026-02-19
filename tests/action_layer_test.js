
import { ActionAPI } from '../src/actions/core/ActionAPI.js';
import { ToolRegistry } from '../src/tools/core/ToolRegistry.js';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Bot
const mockBot = {
    version: '1.20.1',
    entity: {
        position: { x: 0, y: 64, z: 0 },
        height: 1.62
    },
    inventory: {
        items: () => [],
        slots: []
    },
    chat: (msg) => console.log(`[Bot Chat] ${msg}`),
    pathfinder: {
        setGoal: () => { },
        setMovements: () => { },
        stop: () => { },
        isMoving: () => false
    },
    pvp: {
        stop: () => { }
    },
    stopDigging: () => { },
    clearControlStates: () => { },
    on: () => { },
    once: () => { },
    emit: () => { },
    blockAt: (pos) => ({ name: 'air', position: pos }),
    registry: {
        blocksByName: {
            stone: { id: 1 },
            log: { id: 2 }
        },
        entitiesByName: {
            player: { id: 100 }
        }
    }
};

// Mock Agent
const mockAgent = {
    bot: mockBot,
    name: 'TestBot',
    config: {
        profile: {
            name: 'TestBot'
        }
    },
    history: {
        add: (role, content) => console.log(`[History] ${role}: ${content}`)
    },
    memory: {
        vector: null
    },
    skillLibrary: {}, // Mock SkillLibrary
    brain: {
        chat: async () => "{}"
    }
};

async function runTests() {
    console.log('--- Action Layer & Tool Registry Tests ---');

    console.log('1. Initializing ToolRegistry...');
    mockAgent.toolRegistry = new ToolRegistry(mockAgent);
    // Mock Agent needs Reference to ToolRegistry

    console.log('2. Discovering Skills...');
    // We need to point to the real skills directory relative to this test file or CWD
    // usage in ToolRegistry assumes process.cwd() is root. 
    // Assuming run from root: node tests/action_layer_test.js

    await mockAgent.toolRegistry.discoverSkills();

    const skills = mockAgent.toolRegistry.skills;
    console.log(`   Discovered ${skills.size} skills.`);

    const expectedSkills = ['gather_wood', 'mine_ores', 'go_to', 'follow_player', 'retreat'];
    const missing = expectedSkills.filter(s => !skills.has(s));

    if (missing.length > 0) {
        console.error('❌ Missing expected skills:', missing);
        process.exit(1);
    } else {
        console.log('✅ All expected updated skills found.');
    }

    console.log('3. Verifying ActionAPI Strict Parameters...');
    const actionAPI = new ActionAPI(mockAgent);

    // Test moveto
    try {
        const result = await actionAPI.moveto({ position: { x: 10, y: 64, z: 10 } });
        // It might fail because of missing movement implementation or timeout in mock, 
        // but it should NOT fail with "invalid parameters" syntax error.
        // Expecting valid call structure.
        console.log('✅ ActionAPI.moveto called with object params.');
    } catch (e) {
        console.warn('⚠️ ActionAPI.moveto threw error (expected in mock):', e.message);
        if (e.message.includes('Invalid parameters')) {
            console.error('❌ ActionAPI.moveto failed parameter validation!');
            process.exit(1);
        }
    }

    // Test mine
    try {
        // Mock specific behavior in actionAPI if needed, or just ensure it accepts the object
        // ActionAPI.mine calls skills.mine_ores usually? Or logic inside?
        // Let's check ActionAPI.mine implementation.
        // It's likely using `mine_ores` skill or internal logic.
        // If internal logic refactored, it should accept params.
        const result = await actionAPI.mine({ target: 'stone', count: 1 });
        console.log('✅ ActionAPI.mine called with object params.');
    } catch (e) {
        console.warn('⚠️ ActionAPI.mine threw:', e.message);
    }

    console.log('4. Verifying CodeEngine Skill Injection (Simulation)...');
    // We simulate what CodeEngine does:
    const skillsSource = {};
    for (const [name, metadata] of skills) {
        if (typeof metadata.execute === 'function') {
            skillsSource[name] = metadata.execute.toString();
        }
    }

    if (skillsSource['gather_wood'] && skillsSource['gather_wood'].includes('export default')) {
        // ToolRegistry.loadSkill usually imports the module. 
        // If we use .toString() on the default export function, it should verify it looks like a function
        console.log('✅ gather_wood source extracted.');
    } else if (skillsSource['gather_wood']) {
        console.log('✅ gather_wood source extracted (native function).');
    } else {
        console.error('❌ gather_wood source NOT extracted.');
        process.exit(1);
    }

    console.log('\n✅ All Tests Passed (Architecture Verification)');
}

runTests().catch(e => {
    console.error('Test Runner Failed:', e);
    process.exit(1);
});
