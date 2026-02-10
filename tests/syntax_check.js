const modules = [
    '../src/agent/agent.js',
    '../src/agent/core/CoreSystem.js',
    '../src/agent/core/ToolRegistry.js',
    '../src/agent/reflexes/CombatReflex.js',
    '../src/skills/library/craft_items.js',
    '../src/skills/library/gather_resources.js',
    '../src/skills/library/mine_ores.js'
];

for (const mod of modules) {
    await import(mod);
    console.log(`Syntax OK: ${mod}`);
}

process.exit(0);
