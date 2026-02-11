import { CodeSandbox } from '../src/agent/core/CodeSandbox.js';

async function runTests() {
    const sandbox = new CodeSandbox({ timeout: 200, memoryLimit: 128 });

    console.log('--- Test 1: Basic Execution ---');
    const test1 = sandbox.execute('2 + 2');
    console.log('Result:', test1);

    console.log('\n--- Test 2: Bot Mock Access ---');
    const test2 = sandbox.execute('bot.health + 5');
    console.log('Result:', test2);

    console.log('\n--- Test 3: Standard Globals ---');
    const test3 = sandbox.execute('Math.sqrt(16)');
    console.log('Result:', test3);

    console.log('\n--- Test 4: Infinite Loop Protection ---');
    const startTime = Date.now();
    const test4 = sandbox.execute('while(true) {}');
    console.log('Result:', test4);
    console.log(`Duration: ${Date.now() - startTime}ms`);

    console.log('\n--- Test 5: Dangerous Pattern (process) ---');
    const test5 = sandbox.execute('process.exit()');
    console.log('Result:', test5);

    console.log('\n--- Test 6: Dangerous Pattern (fs) ---');
    const test6 = sandbox.execute('const fs = require("fs");');
    console.log('Result:', test6);
}

runTests().catch(console.error);
