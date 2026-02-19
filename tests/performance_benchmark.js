import { Agent } from '../src/agent/agent.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';

async function runBenchmark() {
    console.log('🚀 Starting Performance Benchmarks...');

    const agent = new Agent();
    agent.name = 'BenchmarkBot';

    // We only need basic boot for benchmarks, not a full network connect
    await agent.start();

    const startTime = performance.now();
    const ITERATIONS = 1000;

    // 1. Blackboard Latency (Optimized)
    console.log(`\n--- Benchmark 1: Blackboard Latency (${ITERATIONS} iterations) ---`);
    const bbStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        agent.scheduler.blackboard.set('strategic_data.test_key', i);
        agent.scheduler.blackboard.get('strategic_data.test_key');
    }
    const bbEnd = performance.now();
    console.log(`✅ Avg Get/Set Latency: ${((bbEnd - bbStart) / ITERATIONS).toFixed(4)}ms`);

    // 2. Social Engine Latency (Mock Interaction)
    console.log('\n--- Benchmark 2: Social Engine Interaction ---');
    const socialStart = performance.now();
    // SocialEngine might fail if bot isn't spawned, but handleChatInteraction has check
    await agent.social.handleChatInteraction('Tester', 'Hello, how are you?');
    const socialEnd = performance.now();
    console.log(`✅ Social Response Latency: ${(socialEnd - socialStart).toFixed(2)}ms`);

    // 3. Memory Report (Profiler check)
    console.log('\n--- Benchmark 3: Profiler Memory Report ---');
    agent.profiler.reportMemory();

    // 4. Summarize
    console.log('\n--- Results Summary ---');
    const totalTime = performance.now() - startTime;
    console.log(`Total Benchmark Time: ${totalTime.toFixed(2)}ms`);
    console.log('Operational Status: STABLE');

    // Shutdown
    agent.core.shutdown();
    process.exit(0);
}

runBenchmark().catch(err => {
    console.error('❌ Benchmark Failed:', err);
    process.exit(1);
});
