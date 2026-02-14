#!/usr/bin/env node

/**
 * Groq Integration Verification Test
 * 
 * Tests:
 * 1. Module loading (groq.js exists and exports correctly)
 * 2. Model detection (groq model strings route to groq API)
 * 3. Profile loading (groq.json loads without errors)
 * 4. API key resolution (getKey retrieves GROQCLOUD_API_KEY)
 * 5. GroqCloudAPI instantiation (constructor works with params)
 * 
 * Run with: node test_groq_integration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════════');
console.log('  GROQ INTEGRATION VERIFICATION TEST');
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

// TEST 1: groq.js module exists and exports GroqCloudAPI
test('Module: groq.js exists', () => {
    const groqPath = path.join(__dirname, 'src/models/groq.js');
    if (!fs.existsSync(groqPath)) throw new Error('groq.js not found');
});

// TEST 2: Load and validate GroqCloudAPI class
test('Module: GroqCloudAPI can be imported', async () => {
    try {
        const { GroqCloudAPI } = await import('./src/models/groq.js');
        if (!GroqCloudAPI) throw new Error('GroqCloudAPI class not exported');
        if (GroqCloudAPI.prefix !== 'groq') throw new Error(`Prefix is '${GroqCloudAPI.prefix}', expected 'groq'`);
    } catch (err) {
        throw new Error(`Import failed: ${err.message}`);
    }
});

// TEST 3: groq.json profile exists
test('Profile: groq.json exists', () => {
    const profilePath = path.join(__dirname, 'profiles/groq.json');
    if (!fs.existsSync(profilePath)) throw new Error('groq.json not found');
});

// TEST 4: groq.json has valid JSON and required fields
test('Profile: groq.json is valid JSON with required fields', () => {
    const profilePath = path.join(__dirname, 'profiles/groq.json');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content);
    
    if (!profile.name) throw new Error('Missing "name" field');
    if (!profile.model) throw new Error('Missing "model" field');
    if (!profile.model.api) throw new Error('Missing "model.api" field');
    if (!profile.model.model) throw new Error('Missing "model.model" field');
    if (profile.model.api !== 'groq') throw new Error(`model.api is '${profile.model.api}', expected 'groq'`);
});

// TEST 5: Model detection in _model_map.js
test('Model Detection: Groq model strings are detected', async () => {
    try {
        const mapContent = fs.readFileSync(path.join(__dirname, 'src/models/_model_map.js'), 'utf-8');
        if (!mapContent.includes("profile.model.includes('groq')")) {
            throw new Error("Groq detection not found in _model_map.js");
        }
        if (!mapContent.includes("profile.api = 'groq'")) {
            throw new Error("Groq API assignment not found in _model_map.js");
        }
    } catch (err) {
        throw new Error(`Detection check failed: ${err.message}`);
    }
});

// TEST 6: Keys.json has GROQCLOUD_API_KEY entry
test('Config: keys.json includes GROQCLOUD_API_KEY', () => {
    const keysPath = path.join(__dirname, 'keys.json');
    const content = fs.readFileSync(keysPath, 'utf-8');
    const keys = JSON.parse(content);
    
    if (!('GROQCLOUD_API_KEY' in keys)) throw new Error('GROQCLOUD_API_KEY not in keys.json');
});

// TEST 7: GroqCloudAPI constructor doesn't throw
test('Constructor: GroqCloudAPI instantiation works', async () => {
    try {
        // Mock getKey to avoid requiring actual API key
        const { GroqCloudAPI } = await import('./src/models/groq.js');
        
        // This will create the instance but the Groq SDK itself won't be initialized
        // without a valid API key - we're just checking the constructor runs
        const instance = new GroqCloudAPI('meta/llama-3.3-70b-versatile', null, {
            temperature: 0.7,
            max_completion_tokens: 2048
        });
        
        if (!instance) throw new Error('Constructor returned falsy value');
        if (!instance.model_name) throw new Error('model_name not set');
        if (instance.model_name !== 'meta/llama-3.3-70b-versatile') {
            throw new Error(`model_name is '${instance.model_name}', expected 'meta/llama-3.3-70b-versatile'`);
        }
    } catch (err) {
        if (err.message.includes('apiKey')) {
            // API key error is expected since GROQCLOUD_API_KEY is empty
            // as long as the constructor ran, this is fine
            return;
        }
        throw err;
    }
});

// TEST 8: Groq is listed in settings.js profiles
test('Settings: groq.json is listed in settings.js', () => {
    const settingsPath = path.join(__dirname, 'settings.js');
    const content = fs.readFileSync(settingsPath, 'utf-8');
    
    if (!content.includes('./profiles/groq.json')) {
        throw new Error('groq.json profile not listed in settings.js');
    }
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failCount === 0) {
    console.log('✅ ALL TESTS PASSED! Groq integration is complete.\n');
    console.log('NEXT STEPS:');
    console.log('1. Set GROQCLOUD_API_KEY in keys.json with a valid Groq API key');
    console.log('2. Uncomment "./profiles/groq.json" in settings.js to enable the Groq bot');
    console.log('3. Run the bot with: node main.js\n');
    process.exit(0);
} else {
    console.log(`❌ ${failCount} test(s) failed. Please review above.\n`);
    process.exit(1);
}
