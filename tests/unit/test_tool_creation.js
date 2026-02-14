
import { ToolCreatorEngine } from '../../src/agent/core/ToolCreatorEngine.js';
import fs from 'fs';
import path from 'path';

// Mock Agent & Brain
const mockAgent = {
    bot: {
        chat: (msg) => console.log(`[Bot] ${msg}`)
    },
    brain: {
        generateTool: async (need, context) => {
            console.log(`[MockBrain] Generating tool for: ${need}`);
            return {
                schema: {
                    name: 'test_obsidian_miner',
                    description: 'Mines obsidian efficiently',
                    parameters: {
                        type: 'object',
                        properties: { count: { type: 'number' } },
                        required: ['count']
                    }
                },
                code: `async (agent, params) => { console.log('Mining obsidian...', params.count); return { success: true }; }`
            };
        }
    },
    toolRegistry: {
        _loadSkill: async (filePath) => {
            console.log(`[MockRegistry] Loading skill from ${filePath}`);
            return true;
        }
    }
};

async function testToolCreation() {
    console.log('--- Testing ToolCreatorEngine ---');

    const engine = new ToolCreatorEngine(mockAgent);
    const result = await engine.createTool('mine obsidian', 'Need for nether portal');

    if (result) {
        console.log('✅ Tool creation reported success.');
    } else {
        console.error('❌ Tool creation returned false.');
        process.exit(1);
    }

    // Verify file existence
    const filePath = path.join(process.cwd(), 'src/skills/library/dynamic/test_obsidian_miner.js');
    if (fs.existsSync(filePath)) {
        console.log('✅ Tool file created.');
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('export const metadata') && content.includes('export default async')) {
            console.log('✅ File content looks valid.');
        } else {
            console.error('❌ File content invalid:\n', content);
            process.exit(1);
        }

        // Cleanup
        fs.unlinkSync(filePath);
    } else {
        console.error('❌ Tool file NOT found at:', filePath);
        process.exit(1);
    }

    console.log('ALL TESTS PASSED');
}

testToolCreation().catch(console.error);
