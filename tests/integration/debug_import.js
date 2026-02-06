console.log('Starting debug import...');
try {
    const mod = await import('../../src/agent/core/ContextManager.js');
    console.log('Import successful:', mod);
} catch (e) {
    console.error('Import failed:', e);
}
