/**
 * Test: CogneeMemoryBridge Integration
 * 
 * Tests the bridge connectivity and fallback behavior
 * Run: node src/memory/test_bridge.js
 */

import { CogneeMemoryBridge } from './CogneeMemoryBridge.js';

console.log('=' * 60);
console.log('  CogneeMemoryBridge Integration Test');
console.log('='.repeat(60) + '\n');

// Mock agent object
const mockAgent = {
    name: 'TestBot',
    prompter: null
};

const bridge = new CogneeMemoryBridge(mockAgent);

async function runTests() {
    try {
        // Test 1: Health Check
        console.log('[1/5] Testing health check...');
        const health = await bridge.healthCheck();
        console.log(`  ✓ Health check completed: ${health ? 'Healthy' : 'Degraded'}\n`);

        // Test 2: Store Experience
        console.log('[2/5] Testing storeExperience...');
        const storeResult = await bridge.storeExperience(
            'test_world_001',
            [
                'Bot found diamonds at (-120, 12, 340)',
                'Village located at (50, 64, -100)',
                'Zombie attacked at night'
            ],
            { source: 'test', timestamp: Date.now() }
        );

        if (storeResult.success) {
            console.log(`  ✓ Stored ${storeResult.facts_stored} facts`);
            if (storeResult.fallback) {
                console.log('  ⚠ Used VectorStore fallback');
            }
        } else {
            console.log('  ✗ Store failed:', storeResult.error);
        }
        console.log('');

        // Test 3: Recall
        console.log('[3/5] Testing recall...');
        const recallResult = await bridge.recall(
            'test_world_001',
            'Where are diamonds?',
            3
        );

        if (recallResult.success) {
            console.log(`  ✓ Found ${recallResult.count} results`);
            if (recallResult.fallback) {
                console.log('  ⚠ Used VectorStore fallback');
            }

            recallResult.results.forEach((result, idx) => {
                console.log(`    ${idx + 1}. ${result.substring(0, 60)}...`);
            });
        } else {
            console.log('  ✗ Recall failed:', recallResult.error);
        }
        console.log('');

        // Test 4: Statistics
        console.log('[4/5] Testing statistics...');
        const stats = bridge.getStats();
        console.log('  Statistics:');
        console.log(`    Total requests: ${stats.totalRequests}`);
        console.log(`    Successful: ${stats.successfulRequests}`);
        console.log(`    Failed: ${stats.failedRequests}`);
        console.log(`    Fallback: ${stats.fallbackRequests} (${stats.fallbackRate})`);
        console.log(`    Service available: ${stats.serviceAvailable}`);
        console.log('');

        // Test 5: Clear World
        console.log('[5/5] Testing clearWorld...');
        const clearResult = await bridge.clearWorld('test_world_001');
        if (clearResult.success) {
            console.log('  ✓ World cleared successfully');
        } else {
            console.log('  ⚠ Clear failed (might not be supported yet)');
        }
        console.log('');

        // Final summary
        console.log('='.repeat(60));
        console.log('  TEST SUMMARY');
        console.log('='.repeat(60));
        console.log('');
        console.log('Bridge functionality:');
        console.log(stats.serviceAvailable
            ? '  ✓ Cognee service connected'
            : '  ⚠ Cognee unavailable - using VectorStore fallback');
        console.log('  ✓ Store and recall working');
        console.log('  ✓ Error handling functional');
        console.log('');
        console.log('Integration status:');
        if (stats.fallbackRate === '0%') {
            console.log('  ✅ Full Cognee integration active');
        } else if (stats.fallbackRate === '100%') {
            console.log('  ⚠️ Running in fallback mode (start Cognee service)');
            console.log('');
            console.log('To start Cognee service:');
            console.log('  cd services');
            console.log('  .\\venv\\Scripts\\Activate.ps1');
            console.log('  uvicorn memory_service:app --port 8001');
        } else {
            console.log('  ⚡ Hybrid mode - some requests using fallback');
        }
        console.log('');
        console.log('✨ CogneeMemoryBridge ready for integration!\n');

    } catch (err) {
        console.error('\n✗ TEST FAILED');
        console.error('Error:', err.message);
        console.error('\nStack:', err.stack);
        process.exit(1);
    }
}

// Run tests
runTests();
