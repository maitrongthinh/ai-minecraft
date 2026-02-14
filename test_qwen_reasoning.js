#!/usr/bin/env node

/**
 * Qwen Reasoning API Integration Verification Test
 * 
 * Tests:
 * 1. Qwen module loading (qwen.js exists and supports reasoning)
 * 2. Fast profile (groq.json - low reasoning effort)
 * 3. Balanced profile (qwen.json - low reasoning effort)
 * 4. Deep profile (qwen-deep.json - high reasoning effort)
 * 5. Reasoning parameter support in Qwen class
 * 6. API key configuration
 * 
 * Run with: node test_qwen_reasoning.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════════');
console.log('  QWEN REASONING API INTEGRATION TEST');
console.log('═══════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passCount++;
    } catch (err) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${err.message}`);
        failCount++;
    }
}

// TEST 1: qwen.js module exists
test('Module: qwen.js exists', () => {
    const qwenPath = path.join(__dirname, 'src/models/qwen.js');
    if (!fs.existsSync(qwenPath)) throw new Error('qwen.js not found');
});

// TEST 2: qwen.js supports reasoning parameters
test('Module: qwen.js supports reasoning parameters', () => {
    const qwenContent = fs.readFileSync(path.join(__dirname, 'src/models/qwen.js'), 'utf-8');
    if (!qwenContent.includes('reasoning')) {
        throw new Error('Reasoning parameter support not found in qwen.js');
    }
    if (!qwenContent.includes('pack.reasoning = this.params.reasoning')) {
        throw new Error('Reasoning parameter forwarding not found');
    }
});

// TEST 3: Fast profile (groq.json) exists
test('Profile: groq.json (Qwen Fast) exists', () => {
    const profilePath = path.join(__dirname, 'profiles/groq.json');
    if (!fs.existsSync(profilePath)) throw new Error('groq.json not found');
});

// TEST 4: Fast profile has correct reasoning config
test('Profile: groq.json has low reasoning effort', () => {
    const profilePath = path.join(__dirname, 'profiles/groq.json');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content);
    
    if (!profile.model?.params?.reasoning) {
        throw new Error('Missing reasoning config in model');
    }
    if (profile.model.params.reasoning.effort !== 'low') {
        throw new Error(`Expected effort "low", got "${profile.model.params.reasoning.effort}"`);
    }
    if (profile.model.api !== 'qwen') {
        throw new Error(`Expected api "qwen", got "${profile.model.api}"`);
    }
});

// TEST 5: Balanced profile (qwen.json) exists
test('Profile: qwen.json (Qwen Balanced) exists', () => {
    const profilePath = path.join(__dirname, 'profiles/qwen.json');
    if (!fs.existsSync(profilePath)) throw new Error('qwen.json not found');
});

// TEST 6: Balanced profile has correct reasoning config
test('Profile: qwen.json has low reasoning effort', () => {
    const profilePath = path.join(__dirname, 'profiles/qwen.json');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content);
    
    if (!profile.model?.params?.reasoning) {
        throw new Error('Missing reasoning config in model');
    }
    if (profile.model.params.reasoning.effort !== 'low') {
        throw new Error(`Expected effort "low", got "${profile.model.params.reasoning.effort}"`);
    }
});

// TEST 7: Deep profile (qwen-deep.json) exists
test('Profile: qwen-deep.json (Qwen Deep) exists', () => {
    const profilePath = path.join(__dirname, 'profiles/qwen-deep.json');
    if (!fs.existsSync(profilePath)) throw new Error('qwen-deep.json not found');
});

// TEST 8: Deep profile has correct reasoning config
test('Profile: qwen-deep.json has high reasoning effort', () => {
    const profilePath = path.join(__dirname, 'profiles/qwen-deep.json');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content);
    
    if (!profile.model?.params?.reasoning) {
        throw new Error('Missing reasoning config in model');
    }
    if (profile.model.params.reasoning.effort !== 'high') {
        throw new Error(`Expected effort "high", got "${profile.model.params.reasoning.effort}"`);
    }
    if (profile.model.params.reasoning.summary !== 'detailed') {
        throw new Error(`Expected summary "detailed", got "${profile.model.params.reasoning.summary}"`);
    }
});

// TEST 9: API key configured
test('Config: keys.json has QWEN_API_KEY', () => {
    const keysPath = path.join(__dirname, 'keys.json');
    const content = fs.readFileSync(keysPath, 'utf-8');
    const keys = JSON.parse(content);
    
    if (!('QWEN_API_KEY' in keys)) throw new Error('QWEN_API_KEY not in keys.json');
});

// TEST 10: Profiles in settings.js
test('Settings: Qwen profiles listed in settings.js', () => {
    const settingsPath = path.join(__dirname, 'settings.js');
    const content = fs.readFileSync(settingsPath, 'utf-8');
    
    // Check all three profiles are mentioned
    const hasGroq = content.includes('./profiles/groq.json');
    const hasQwen = content.includes('./profiles/qwen.json');
    const hasQwenDeep = content.includes('./profiles/qwen-deep.json');
    
    if (!hasGroq || !hasQwen || !hasQwenDeep) {
        throw new Error('Not all Qwen profiles listed in settings.js');
    }
});

// TEST 11: Reasoning effort levels validation
test('Validation: Reasoning effort levels are correct', () => {
    const profilePaths = [
        path.join(__dirname, 'profiles/groq.json'),
        path.join(__dirname, 'profiles/qwen.json'),
        path.join(__dirname, 'profiles/qwen-deep.json')
    ];
    
    const validEfforts = ['low', 'medium', 'high'];
    const validSummaries = ['auto', 'concise', 'detailed'];
    
    for (const profilePath of profilePaths) {
        const content = fs.readFileSync(profilePath, 'utf-8');
        const profile = JSON.parse(content);
        
        // Check model reasoning
        if (profile.model?.params?.reasoning) {
            const effort = profile.model.params.reasoning.effort;
            const summary = profile.model.params.reasoning.summary;
            
            if (!validEfforts.includes(effort)) {
                throw new Error(`Invalid effort level "${effort}" in ${path.basename(profilePath)}`);
            }
            if (!validSummaries.includes(summary)) {
                throw new Error(`Invalid summary type "${summary}" in ${path.basename(profilePath)}`);
            }
        }
    }
});

// TEST 12: Code model reasoning parameters
test('Profiles: Code models have reasoning parameters', () => {
    const profilePaths = [
        path.join(__dirname, 'profiles/groq.json'),
        path.join(__dirname, 'profiles/qwen.json'),
        path.join(__dirname, 'profiles/qwen-deep.json')
    ];
    
    for (const profilePath of profilePaths) {
        const content = fs.readFileSync(profilePath, 'utf-8');
        const profile = JSON.parse(content);
        
        if (!profile.code_model?.params?.reasoning) {
            throw new Error(`Missing reasoning config in code_model for ${path.basename(profilePath)}`);
        }
    }
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failCount === 0) {
    console.log('✅ ALL TESTS PASSED! Qwen reasoning API is fully configured.\n');
    console.log('PROFILES CREATED:');
    console.log('1. groq.json (Qwen Fast)   - Low reasoning effort (effort: low)');
    console.log('2. qwen.json (Qwen Balanced) - Low reasoning effort (effort: low)');
    console.log('3. qwen-deep.json (Qwen Deep) - High reasoning effort (effort: high)\n');
    console.log('NEXT STEPS:');
    console.log('1. Set QWEN_API_KEY in keys.json with your Qwen API key');
    console.log('2. Uncomment one of the profiles in settings.js');
    console.log('3. Run: node main.js\n');
    console.log('REASONING EFFORT LEVELS:');
    console.log('- low:    Fast responses, minimal reasoning overhead');
    console.log('- medium: Balanced reasoning and speed');
    console.log('- high:   Deep reasoning, thorough analysis (slower)\n');
    process.exit(0);
} else {
    console.log(`❌ ${failCount} test(s) failed. Please review above.\n`);
    process.exit(1);
}
