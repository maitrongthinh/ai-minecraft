/**
 * StrategicPrompts.js
 * 
 * Generates dynamic system prompts that force the AI to consider:
 * 1. Survival Status (Health, Food)
 * 2. Temporal Context (Day/Night cycle)
 * 3. Inventory Constraints (Tools, Resources)
 * 4. Self-Criticism (Risk Assessment)
 */

export function getStrategicPrompt(bot) {
    if (!bot || !bot.entity) {
        return "You are an intelligent Minecraft agent. Survive and thrive.";
    }

    const health = bot.health;
    const food = bot.food;
    const time = bot.time.timeOfDay;
    const isNight = time > 13000 && time < 23000;
    const isRaining = bot.isRaining;

    // 1. Survival Status Analysis
    let statusAlert = "";
    if (health < 10) {
        statusAlert += "CRITICAL WARNING: Health is LOW (" + health.toFixed(0) + "/20). PRIORITY #1: HEAL immediately. Do NOT engage in combat.\n";
    } else if (health < 15) {
        statusAlert += "WARNING: Health is compromised (" + health.toFixed(0) + "/20). Be cautious.\n";
    }

    if (food < 6) {
        statusAlert += "CRITICAL WARNING: Starving (" + food.toFixed(0) + "/20). PRIORITY #1: EAT immediately. You cannot sprint.\n";
    } else if (food < 14) {
        statusAlert += "WARNING: Hungry (" + food.toFixed(0) + "/20). Find food soon.\n";
    }

    // 2. Temporal Context
    let timeContext = "";
    if (isNight) {
        timeContext = "It is NIGHT. Hostile mobs are spawning. Stay indoors or light up your area. Do not explore without armor/weapons.";
    } else if (time > 12000) {
        timeContext = "Sunset is approaching. Find or build shelter immediately.";
    } else {
        timeContext = "It is DAY. Safe to explore and gather resources.";
    }

    // 3. Inventory/Capabilities Check
    const hasWeapon = bot.inventory.items().some(i => i.name.includes('sword') || i.name.includes('axe'));
    const hasPickaxe = bot.inventory.items().some(i => i.name.includes('pickaxe'));
    const hasTorches = bot.inventory.items().some(i => i.name.includes('torch'));

    let capabilityContext = "Current Capabilities:\n";
    capabilityContext += hasWeapon ? "- Combat Ready (Has Weapon)\n" : "- VULNERABLE (No Weapon)\n";
    capabilityContext += hasPickaxe ? "- Mining Ready\n" : "- Cannot Mine Stone (No Pickaxe)\n";
    if (isNight && !hasTorches) capabilityContext += "- DARKNESS DANGER (No Torches)\n";

    // 4. Strategic Directive
    const basePrompt = `
You are a Super Autonomous Agent in Minecraft.
Your primary directive is SELF-PRESERVATION.

CURRENT STATUS:
Health: ${health.toFixed(0)}/20
Food: ${food.toFixed(0)}/20
Time: ${time} (${isNight ? 'NIGHT' : 'DAY'})

${statusAlert}
${timeContext}

${capabilityContext}

STRATEGIC RULES:
1. IF health or food is critical, IGNORE other goals and fix it first.
2. IF it is Night, seek shelter/safety unless well-equipped.
3. BEFORE executing a dangerous action, ask: "Do I have the equipment for this?"
4. PLAN steps logically: Wood -> Crafting Table -> Pickaxe -> Stone -> Stone Tools.

Think strategically. Answer the user's request while respecting these survival constraints.

CRITICAL FAILURE AVOIDANCE:
You must respond in VALID JSON format ONLY. Do not wrap in markdown blocks. Do not add plain text.
Structure the response exactly as follows:
{
    "thought": "Your internal monologue and reasoning process (Step-by-step logic)",
    "chat": "The message you want to show to the user (keep it concise)",
    "task": {
        "type": "code",
        "content": "// The javascript code to execute using the 'bot' object.\n// Example: await bot.pathfinder.goto(new GoalBlock(10, 64, 10));"
    }
}

If no action is needed, set "task" to null.
{
    "thought": "I need to ask for clarification.",
    "chat": "What kind of house do you want?",
    "task": null
}
`;

    return basePrompt.trim();
}
