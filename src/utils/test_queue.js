import { RequestQueue } from './RequestQueue.js';

const queue = new RequestQueue({ requestsPerMinute: 60 }); // Fast for testing
queue.backoff.baseDelay = 100; // Speed up testing


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBackoff() {
    console.log('--- Testing Backoff ---');
    let attempts = 0;
    const mockApi = async () => {
        attempts++;
        console.log(`Attempt ${attempts} at ${Date.now()}`);
        if (attempts <= 2) {
            const err = new Error('429 Too Many Requests');
            err.status = 429;
            throw err;
        }
        return 'Success';
    };

    const start = Date.now();
    try {
        const result = await queue.add(mockApi);
        const duration = Date.now() - start;
        console.log(`Result: ${result}`);
        console.log(`Duration: ${duration}ms (Expected > 2000ms due to backoff 1s + 2s approx)`);
    } catch (e) {
        console.error('Test Failed:', e);
    }
}

async function testPriority() {
    console.log('\n--- Testing Priority ---');
    // We need to clog the queue first to test priority order
    // Because if queue is empty, first add executes immediately.

    // 1. Add a slow request to block processing
    queue.add(async () => {
        console.log('Processing Slow Normal Request...');
        await sleep(500);
        return 'Slow';
    }, { priority: 1 });

    // 2. Add Low priority
    const pLow = queue.add(async () => {
        console.log('Processing Low Priority');
        return 'Low';
    }, { priority: 0 });

    // 3. Add High priority
    const pHigh = queue.add(async () => {
        console.log('Processing High Priority');
        return 'High';
    }, { priority: 10 });

    await Promise.all([pLow, pHigh]);
    console.log('Priority Test Done. "High" should appear before "Low" in logs.');
}

async function run() {
    await testBackoff();
    // Reset queue state if needed, or just wait a bit
    await sleep(1000);
    await testPriority();
}

run();
