
import { CodeSanitizer } from '../../src/agent/intelligence/CodeSanitizer.js';

async function testSanitizer() {
    console.log('🧪 Testing CodeSanitizer...');

    // Test 1: Infinite Loop (While)
    const infiniteWhile = `
        while(true) {
            // Infinite
        }
    `;

    try {
        console.log('Running Infinite Loop Test (Expect Timeout in 100ms)...');
        const sanitized = CodeSanitizer.sanitize(infiniteWhile, 100);

        // Emulate execution
        const fn = new Function(sanitized);
        fn();
        console.error('❌ FAIL: Infinite loop did not throw!');
    } catch (e) {
        if (e.message.includes('Execution Timeout')) {
            console.log('✅ PASS: Caught infinite while loop!');
        } else {
            console.error('❌ FAIL: Unexpected error:', e);
        }
    }

    // Test 2: Normal Loop
    const normalLoop = `
        let sum = 0;
        for(let i=0; i<5; i++) {
            sum += i;
        }
        return sum;
    `;

    try {
        console.log('Running Normal Loop Test...');
        const sanitized2 = CodeSanitizer.sanitize(normalLoop, 1000);
        const fn2 = new Function(sanitized2);
        const res = fn2();
        if (res === 10) {
            console.log('✅ PASS: Normal loop executed correctly.');
        } else {
            console.error('❌ FAIL: Normal loop result wrong:', res);
        }
    } catch (e) {
        console.error('❌ FAIL: Normal loop threw error:', e);
    }
}

testSanitizer();
