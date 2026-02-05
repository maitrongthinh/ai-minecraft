import { JsonSanitizer } from './JsonSanitizer.js';

const TEST_CASES = [
    {
        name: "Standard JSON",
        input: '{"key": "value"}',
        expected: { key: "value" }
    },
    {
        name: "Markdown Block",
        input: 'Here is code: ```json\n{"action": "jump"}\n```',
        expected: { action: "jump" }
    },
    {
        name: "Trailing Comma (Auto-Fix)",
        input: '{"items": ["apple", "banana",], "count": 2,}',
        expected: { items: ["apple", "banana"], count: 2 }
    },
    {
        name: "Missing Quotes on Keys",
        input: '{ name: "bot", age: 10 }',
        expected: { name: "bot", age: 10 }
    },
    {
        name: "Single Quotes",
        input: "{ 'status': 'ok' }",
        expected: { status: "ok" }
    }
];

function runTests() {
    console.log('--- Testing JsonSanitizer ---');
    let passed = 0;

    for (const test of TEST_CASES) {
        console.log(`\nTesting: ${test.name}`);
        const result = JsonSanitizer.parse(test.input);

        try {
            const resultStr = JSON.stringify(result);
            const expectedStr = JSON.stringify(test.expected);

            if (resultStr === expectedStr) {
                console.log('✅ PASS');
                passed++;
            } else {
                console.error('❌ FAIL');
                console.error('Input:', test.input);
                console.error('Expected:', expectedStr);
                console.error('Got:', resultStr);
            }
        } catch (e) {
            console.error('❌ FAIL (Error)', e.message);
        }
    }

    console.log(`\nSummary: ${passed}/${TEST_CASES.length} Passed`);
}

runTests();
