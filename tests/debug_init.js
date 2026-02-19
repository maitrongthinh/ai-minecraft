import { Agent } from '../src/agent/agent.js';

process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:');
    console.error(err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('🌊 UNHANDLED REJECTION:');
    console.error(err);
    process.exit(1);
});

async function debug() {
    console.log('🔍 Starting Diagnostic Boot (v2)...');
    const agent = new Agent();
    console.log('Agent instantiated.');

    console.log('Attempting agent.start()...');
    // Force a dummy profile if needed? Agent.start does its own loading.
    await agent.start();
    console.log('✅ agent.start() completed successfully.');

    // Check if profiler is working
    if (agent.profiler) {
        agent.profiler.reportMemory();
    }

    process.exit(0);
}

debug();
