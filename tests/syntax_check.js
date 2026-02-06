try {
    const { SmartCoder } = await import('../src/agent/SmartCoder.js');
    console.log('SmartCoder syntax OK');
} catch (e) {
    console.error('Syntax Error:', e);
}
