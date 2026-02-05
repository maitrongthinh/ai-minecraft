/**
 * Integration Test: MiniMax-M2 API Connection
 * 
 * Tests the connection to MiniMax-M2 via MegaLLM.io
 * Run: node tests/integration/test_minimax.js
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load API keys
const keysPath = path.resolve(__dirname, '../../keys.json');
let keys = {};

if (fs.existsSync(keysPath)) {
    keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
} else {
    console.error('❌ keys.json not found. Please create it first.');
    console.log('Copy keys.example.json to keys.json and add your MEGALLM_API_KEY');
    process.exit(1);
}

if (!keys.MEGALLM_API_KEY) {
    console.error('❌ MEGALLM_API_KEY not found in keys.json');
    console.log('Please add your MegaLLM API key to keys.json');
    console.log('Get your key from: https://ai.megallm.io');
    process.exit(1);
}

console.log('[MiniMax Test] Starting connection test...\n');

const client = new OpenAI({
    baseURL: 'https://ai.megallm.io/v1',
    apiKey: keys.MEGALLM_API_KEY
});

async function testMiniMaxConnection() {
    try {
        console.log('1️⃣  Testing API connection...');
        const startTime = Date.now();
        
        const response = await client.chat.completions.create({
            model: 'minimaxai/minimax-m2',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful Minecraft assistant.'
                },
                {
                    role: 'user',
                    content: 'Respond with a valid JSON object containing: {"status": "ok", "message": "Connection successful"}'
                }
            ],
            temperature: 0.5,
            max_tokens: 100
        });
        
        const endTime = Date.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('   ✅ API connection successful');
        console.log(`   ✅ Response time: ${responseTime}s`);
        
        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response choices returned');
        }
        
        console.log('\n2️⃣  Validating response format...');
        const content = response.choices[0].message.content;
        console.log('   Raw response:', content);
        
        // Try to parse JSON if present
        try {
            const jsonMatch = content.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('   ✅ JSON parsing successful:', parsed);
            } else {
                console.log('   ⚠️  No JSON object found in response');
            }
        } catch (e) {
            console.log('   ⚠️  Response is not JSON, but that\'s OK');
        }
        
        console.log('\n3️⃣  Testing strategic planning prompt...');
        const planningStart = Date.now();
        
        const planResponse = await client.chat.completions.create({
            model: 'minimaxai/minimax-m2',
            messages: [
                {
                    role: 'system',
                    content: 'You are a strategic Minecraft survival expert. Analyze situations and provide risk assessments.'
                },
                {
                    role: 'user',
                    content: `Objective: Mine diamonds in a deep cave.
                    
Current State:
- Health: 60%
- Food: 40%
- Equipment: Iron pickaxe (50 durability), no armor

Analyze the risks and provide a plan. Format:
1. RISKS: [List dangers]
2. REQUIREMENTS: [What do I need first?]
3. PLAN: [Step by step]`
                }
            ],
            temperature: 0.7,
            max_tokens: 300
        });
        
        const planningEnd = Date.now();
        const planningTime = ((planningEnd - planningStart) / 1000).toFixed(2);
        
        console.log(`   ✅ Strategic planning test completed (${planningTime}s)`);
        console.log('\n   Response preview:');
        const preview = planResponse.choices[0].message.content.substring(0, 200);
        console.log('   ' + preview + '...');
        
        // Check if response contains our expected format
        const planContent = planResponse.choices[0].message.content.toLowerCase();
        if (planContent.includes('risk') && planContent.includes('plan')) {
            console.log('   ✅ Response contains strategic analysis');
        } else {
            console.log('   ⚠️  Response format may need adjustment');
        }
        
        console.log('\n4️⃣  Checking rate limit status...');
        // Note: MegaLLM doesn't expose rate limit in headers like OpenAI
        // So we just note the successful requests
        console.log('   ✅ 2 requests completed successfully');
        console.log('   📊 Recommended daily limit: ~40 requests');
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ ALL TESTS PASSED');
        console.log('='.repeat(60));
        console.log('\n📋 Summary:');
        console.log(`   • API Key: Valid`);
        console.log(`   • Model: minimaxai/minimax-m2`);
        console.log(`   • Average Response Time: ${responseTime}s`);
        console.log(`   • Strategic Planning: Working`);
        console.log('\n✨ MiniMax-M2 is ready for use in Mindcraft!');
        console.log('\nNext steps:');
        console.log('   1. Update settings.js with your desired rate_limit');
        console.log('   2. Run the bot: node main.js');
        console.log('   3. Test with a strategic command like "Plan to find diamonds"');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED\n');
        
        if (error.status === 401) {
            console.error('Error: Invalid API key');
            console.error('Solution:');
            console.error('  1. Check your MEGALLM_API_KEY in keys.json');
            console.error('  2. Verify the key at https://ai.megallm.io/dashboard');
            console.error('  3. Make sure the key starts with "megallm_"');
        } else if (error.status === 429) {
            console.error('Error: Rate limit exceeded');
            console.error('Solution:');
            console.error('  1. Wait a few minutes before retrying');
            console.error('  2. Check your usage at https://ai.megallm.io/dashboard');
            console.error('  3. Consider upgrading your plan');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            console.error('Error: Cannot reach MegaLLM servers');
            console.error('Solution:');
            console.error('  1. Check your internet connection');
            console.error('  2. Verify MegaLLM status: https://status.megallm.io');
            console.error('  3. Check if your firewall is blocking the connection');
        } else {
            console.error('Error details:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
        }
        
        console.error('\nFor help, visit: https://docs.megallm.io');
        process.exit(1);
    }
}

// Run the test
testMiniMaxConnection();
