import fs from 'fs';

function assertCheck(results, label, condition) {
    results.push({ label, condition });
    console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`);
}

const agentCode = fs.readFileSync('src/agent/agent.js', 'utf8');
const brainCode = fs.readFileSync('src/brain/UnifiedBrain.js', 'utf8');

const results = [];

console.log('Running Cognee integration static checks...');

assertCheck(results, 'Cognee bridge import exists', agentCode.includes("import { CogneeMemoryBridge }"));
assertCheck(results, 'world_id generated on spawn', agentCode.includes('this.world_id = randomUUID()'));
assertCheck(results, 'Cognee bridge initialized', agentCode.includes('this.cogneeMemory = new CogneeMemoryBridge'));
assertCheck(results, 'UnifiedBrain rebind with Cognee + skills', agentCode.includes('new UnifiedBrain(this, this.prompter, this.cogneeMemory, this.skillLibrary)'));
assertCheck(results, 'death event stored to Cognee', agentCode.includes('StoreDeathEvent'));
assertCheck(results, 'player interaction stored to Cognee', agentCode.includes('StoreInteraction'));

assertCheck(results, 'UnifiedBrain has context enrichment', brainCode.includes('async _enrichContext(context, worldId)'));
assertCheck(results, 'UnifiedBrain queries Cognee recall', brainCode.includes('this.cogneeMemory.recall(worldId'));
assertCheck(results, 'UnifiedBrain injects memory context', brainCode.includes('[MEMORY RECALL] Relevant past experiences'));

const failed = results.filter(r => !r.condition);
if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    globalThis.process.exit(1);
}

console.log('\nAll Cognee integration checks passed.');
globalThis.process.exit(0);
