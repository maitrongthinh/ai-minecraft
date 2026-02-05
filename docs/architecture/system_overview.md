# System Architecture: Antigravity Bot v2.0

## 1. Overview
The Antigravity Bot is an autonomous agent designed for Minecraft, capable of complex planning, active perception, and self-optimization. It moves beyond simple command-response loops to a continuous, intelligent existence.

## 2. Core Components

### 🧠 DualBrain (The Decision Engine)
Located in `src/brain/DualBrain.js`.
- **Plan (System 2):** Uses high-intelligence LLMs (DeepSeek/GPT-4o) for complex tasks, strategy, and self-prompting.
- **Reflex (System 1):** Uses fast, lower-cost models (Mistral/Haiku) for chat and immediate reactions.
- **Route:** `agent.handleMessage` decides which brain to use based on context.

### ⚡ StateStack (The Behavior Controller)
Located in `src/agent/StateStack.js`.
- Replaces the flat `modes.js`.
- **Priority System:**
  - 100: Critical (Hardware/Error)
  - 80: Combat (Reflex)
  - 50: Active Task (Building/Mining)
  - 10: Idle/Wander
- **Adapter:** `agent.js` maps the top state in the stack to legacy mode execution functions.

### 👁️ Active Vision (The Eyes)
Located in `src/agent/vision/vision_interpreter.js`.
- **Loop:** Every 10 seconds, `scanEnvironment()` triggers.
- **Process:** Captures screenshot -> LLM Analysis -> Updates `agent.spatial` memory.
- **Integration:** Allows the bot to "see" enemies or resources without being told.

### 📚 Skill Library & Optimizer (The Hands)
Located in `src/skills/`.
- **Library:** Stores executable JS code for tasks (`craft_pickaxe.js`).
- **Optimizer:** `SkillOptimizer.js` runs in the background. If a skill fails or succeeds often, it uses AI to rewrite the code for better performance.

## 3. Data Flow
1.  **Input:** Chat / Vision / Events (Hurt/Death).
2.  **Processing:** 
    - `Arbiter` checks safety.
    - `DualBrain` plans response.
    - `StateStack` updates behavior.
3.  **Output:** 
    - `ActionManager` executes commands.
    - `Bot` (Mineflayer) interacts with world.

## 4. Memory (Cognee)
- **Vector DB:** Stores experiences and "facts".
- **Recall:** `StrategyPlanner` queries Cognee before making plans to avoid repeating mistakes.
