import { MemorySystem } from '../src/agent/memory/MemorySystem.js';
import { EvolutionEngine } from '../src/agent/core/EvolutionEngine.js';
import { ToolRegistry } from '../src/tools/core/ToolRegistry.js';
import { SocialEngine } from '../src/agent/interaction/SocialEngine.js';
import { CoreSystem } from '../src/agent/core/CoreSystem.js';
import { Agent } from '../src/agent/agent.js';

console.log('--- Import Check ---');
try {
    const agent = new Agent();
    console.log('✅ Agent instantiated');
    const core = new CoreSystem(agent);
    console.log('✅ CoreSystem instantiated');
    const memory = new MemorySystem(agent);
    console.log('✅ MemorySystem instantiated');
    const social = new SocialEngine(agent);
    console.log('✅ SocialEngine instantiated');
    const evolution = new EvolutionEngine(agent);
    console.log('✅ EvolutionEngine instantiated');
    const toolRegistry = new ToolRegistry(agent);
    console.log('✅ ToolRegistry instantiated');
    console.log('🚀 All modules imported and instantiated successfully!');
} catch (error) {
    console.error('❌ Error during instantiation:', error);
    process.exit(1);
}
