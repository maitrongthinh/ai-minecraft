
import { SafetySandwich } from '../src/agent/safety/SafetySandwich.js';
import { RollbackManager } from '../src/agent/safety/RollbackManager.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';

async function runTest() {
    console.log('🧪 Starting Safety Pipeline Test...');

    const mockAgent = {
        toolRegistry: {
            _loadSkill: async () => true,
            skills: new Map() // Mock skills map
        }
    };

    const safety = new SafetySandwich(mockAgent);
    const rollback = new RollbackManager(mockAgent);

    // TEST 1: Static Analysis (Forbidden Token)
    console.log('\n--- Test 1: Static Analysis (Forbidden Token) ---');
    const badCode1 = `async function killProcess(bot) { process.exit(1); }`;
    const res1 = await safety.validate(badCode1);
    if (!res1.valid && res1.reasoning.includes('Forbidden tokens')) {
        console.log('✅ Pass: Detected process.exit');
    } else {
        console.log('❌ Fail: Did not detect forbidden token', res1);
    }

    // TEST 2: Logical Analysis (Syntax/Runtime Error)
    console.log('\n--- Test 2: Logical Analysis (Syntax Error) ---');
    const badCode2 = `async function broken(bot) { return await; }`; // Syntax error
    const res2 = await safety.validate(badCode2);
    if (!res2.valid && res2.reasoning.includes('Syntax Error')) {
        console.log('✅ Pass: Detected syntax error');
    } else {
        console.log('❌ Fail: Did not detect syntax error', res2);
    }

    // TEST 3: Mock Runtime Crash
    console.log('\n--- Test 3: Runtime Logic Crash ---');
    const badCode3 = `
    async function crash(bot) { 
        bot.undefined_property.doSomething(); 
    }`;
    const res3 = await safety.validate(badCode3);
    // Note: This might actually pass "static" and "load", 
    // but fail if we tried to run a test.
    // The current SafetySandwich.validate only runs execution(code) which defines the function.
    // It does NOT call the function unless Behavioral Test is provided.
    // So this should PASS validate(code) but FAIL validate(code, test).

    // Let's try with a test that calls it
    const testCode3 = `await skills.crash(bot);`;
    const res3b = await safety.validate(badCode3, testCode3);

    if (!res3b.valid && res3b.reasoning.includes('Behavioral Test Failed')) {
        console.log('✅ Pass: Detected runtime crash via Test Runner');
    } else {
        console.log('❌ Fail: Did not detect crash', res3b);
    }

    // TEST 4: Valid Code
    console.log('\n--- Test 4: Valid Code ---');
    const goodCode = `
    async function jump(bot) {
        if (bot.entity.position.y < 100) {
            console.log("Jumping");
        }
    }
    `;
    const goodTest = `await skills.jump(bot); assert(true, "Jumped");`;
    const res4 = await safety.validate(goodCode, goodTest);
    if (res4.valid && res4.layers.behavioral === true) {
        console.log('✅ Pass: Valid code passed all layers');
    } else {
        console.log('❌ Fail: Valid code rejected', res4);
    }

    console.log('\n🧪 Test Suite Complete');
    process.exit(0); // Exit cleanly
}

runTest();
