import { ToolCreatorEngine } from '../../src/agent/core/ToolCreatorEngine.js';
import { ToolRegistry } from '../../src/agent/core/ToolRegistry.js';
import fs from 'fs';
import path from 'path';

// Mock Agent
const mockAgent = {
    name: 'test_creator_bot',
    bot: {
        findBlocks: (opts) => {
            // Mock finding 5 dirt blocks
            if (opts.matching({ name: 'dirt' })) return [1, 2, 3, 4, 5];
            return [];
        }
    },
    toolRegistry: {
        dynamicTools: new Map(),
        tools: [],
        registerDynamicTool: function (name, schema, impl) {
            console.log(`[MockRegistry] Registered ${name}`);
            this.dynamicTools.set(name, { schema, implementation: impl });
            this.tools.push(schema);
        }
    }
};

async function runTests() {
    console.log('🧪 Testing Phase 7: Tool Creator...');

    // Cleanup
    const testDir = path.join(process.cwd(), 'bots', 'test_creator_bot', 'dynamic_tools');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

    const creator = new ToolCreatorEngine(mockAgent);

    // Test 1: Create Tool
    console.log('Test 1: Create Tool');
    const toolName = await creator.createTool('I need to count dirt blocks nearby', {});

    if (!toolName) throw new Error('Tool creation failed');
    if (toolName !== 'count_nearby_blocks_v1') throw new Error('Unexpected tool name');
    console.log('✅ Tool created');

    // Test 2: Persistence
    console.log('Test 2: Persistence');
    const expectedPath = path.join(testDir, `${toolName}.json`);
    console.log('Checking for file at:', expectedPath);
    if (!fs.existsSync(expectedPath)) throw new Error(`File not saved at ${expectedPath}`);
    console.log('✅ Tool saved to disk');

    // Test 3: Execution
    console.log('Test 3: Execution');
    const tool = mockAgent.toolRegistry.dynamicTools.get(toolName);
    if (!tool) throw new Error('Tool not found in registry');

    const result = await tool.implementation(mockAgent, { blockType: 'dirt', radius: 10 });
    if (result.count !== 5) throw new Error(`Expected content 5, got ${result.count}`);
    console.log('✅ Tool execution passed');

    console.log('🎉 All Phase 7 tests passed');
}

runTests().catch(e => {
    console.error('❌ Test Failed:', e);
    process.exit(1);
});
