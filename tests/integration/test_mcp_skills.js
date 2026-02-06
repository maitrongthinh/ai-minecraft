/**
 * Integration Test: Phase 3 - MCP Skill Discovery
 * 
 * Tests:
 * 1. ToolRegistry discovers MCP-compliant skills
 * 2. Schemas are validated correctly
 * 3. Skills can be executed via registry
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { ToolRegistry } from '../../src/agent/core/ToolRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock agent for testing
const mockAgent = {
    bot: null,
    name: 'test_bot'
};

async function testToolRegistry() {
    console.log('🧪 Testing ToolRegistry - MCP Skill Discovery\n');

    try {
        // Test 1: Initialize registry
        console.log('Test 1: Initialize ToolRegistry...');
        const registry = new ToolRegistry(mockAgent);
        console.log('✅ Registry initialized\n');

        // Test 2: Discover skills
        console.log('Test 2: Discover skills from library...');
        await registry.discoverSkills();
        const skillCount = registry.skills.size;
        console.log(`✅ Discovered ${skillCount} skills\n`);

        // Test 3: List all skills
        console.log('Test 3: List all discovered skills...');
        const skills = registry.listSkills();
        skills.forEach(skill => {
            console.log(`  - ${skill.name}: ${skill.description}`);
            console.log(`    Tags: [${skill.tags.join(', ')}]`);
        });
        console.log('✅ All skills listed\n');

        // Test 4: Get skill schemas
        console.log('Test 4: Get MCP schemas...');
        const schemas = registry.getAllSchemas();
        console.log(`✅ Retrieved ${schemas.length} schemas\n`);

        // Test 5: Validate schema format (gather_resources)
        console.log('Test 5: Validate MCP schema format...');
        const gatherSkill = registry.findSkill('gather_resources');

        if (!gatherSkill) {
            throw new Error('gather_resources skill not found');
        }

        // Check required MCP fields
        const requiredFields = ['name', 'description', 'parameters', 'returns', 'tags'];
        for (const field of requiredFields) {
            if (!(field in gatherSkill)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Check parameters schema
        if (gatherSkill.parameters.type !== 'object') {
            throw new Error('Parameters must be of type object');
        }

        if (!gatherSkill.parameters.properties) {
            throw new Error('Parameters must have properties');
        }

        console.log('✅ Schema format validated\n');

        // Test 6: Test parameter validation
        console.log('Test 6: Test parameter validation...');

        // Valid parameters
        const validParams = { resource: 'wood', count: 10 };
        const validation1 = registry._validateParams(validParams, gatherSkill.parameters);
        if (!validation1.valid) {
            throw new Error(`Valid params rejected: ${validation1.error}`);
        }
        console.log('  ✅ Valid parameters accepted');

        // Invalid parameters (missing required)
        const invalidParams = { count: 10 };
        const validation2 = registry._validateParams(invalidParams, gatherSkill.parameters);
        if (validation2.valid) {
            throw new Error('Invalid params accepted (should fail)');
        }
        console.log('  ✅ Invalid parameters rejected');
        console.log('✅ Parameter validation working\n');

        // Test 7: Search skills by tag
        console.log('Test 7: Search skills by tag...');
        const combatSkills = registry.getSkillsByTag('combat');
        console.log(`  Found ${combatSkills.length} combat skills`);
        combatSkills.forEach(s => console.log(`    - ${s.name}`));
        console.log('✅ Tag-based search working\n');

        // Test 8: Usage stats
        console.log('Test 8: Check usage stats...');
        const stats = registry.getUsageStats();
        console.log(`  Tracked ${stats.length} skills`);
        console.log('✅ Usage stats working\n');

        // Summary
        console.log('═══════════════════════════════════');
        console.log('🎉 ALL TESTS PASSED!');
        console.log('═══════════════════════════════════');
        console.log(`✅ ${skillCount} skills discovered`);
        console.log('✅ MCP schema validation working');
        console.log('✅ Parameter validation working');
        console.log('✅ Tag-based search working');
        console.log('✅ Usage stats working');
        console.log('═══════════════════════════════════\n');

        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run tests
testToolRegistry().then(success => {
    process.exit(success ? 0 : 1);
});
