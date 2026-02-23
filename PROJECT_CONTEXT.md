# Minecraft AI Survival Bot — Runtime Architecture

> [!IMPORTANT]
> **RULES FOR AI AGENTS EDITING THIS CODEBASE:**
> 1. If an API, signal, or module is NOT listed here, assume it does NOT exist.
> 2. Do NOT invent new architecture. Fix what exists.
> 3. `src/agent/core/*` is the kernel — modifications must be minimal and tested.

---

## 1. What This Bot Actually Does

An autonomous Minecraft survival bot powered by an LLM (GPT/Gemini). It connects to a Minecraft server via `mineflayer`, perceives its environment, makes decisions, and executes survival tasks (gather wood, craft tools, eat, fight, build shelter). When it fails, it analyzes what went wrong and tries to improve.

**What it CAN do:** Basic survival loop, combat reflexes, wood/ore gathering, crafting, smelting, eating, shelter-seeking, following players, basic collaboration.

**What it CANNOT do:** Reliably build complex structures, navigate the Nether/End autonomously, play in ocean biomes (no biome awareness), run multiple bots in a swarm (SwarmSync disabled).

---

## 2. Entry Point & Boot Sequence

Entry: `main.js` → `src/agent/agent.js` (Agent class, ~2000 lines).

### Boot Phases:
1. **Config Load**: `settings.js` + profile JSON → merged into `this.config`
2. **Kernel Boot** (`CoreSystem.initialize()`):
   - `TaskScheduler` (priority queue + Blackboard state)
   - `MemorySystem` (vector store + chat history)
   - `EnvironmentMonitor` (world scanning)
   - `ReflexSystem` (50ms tick combat/survival reflexes)
   - `ToolRegistry` (auto-discovers skills from `src/skills/library/`)
   - `EvolutionEngine` (post-death analysis + dynamic reflex creation)
3. **Bot Connect**: `mineflayer` bot instance → signal bus → motor cortex
4. **Heavy Subsystems** (after spawn):
   - `KnowledgeStore`, `SkillLibrary`, `ToolCreatorEngine`
   - `UnifiedBrain` (LLM interface — the actual "thinking" layer)
   - `ProactiveCurriculum` (sets goals when idle)

---

## 3. Core Components (What Actually Runs)

### 3.1 Signal Bus (`src/agent/core/SignalBus.js`)

| Signal | Source | Payload |
|--------|--------|---------|
| `SYSTEM_READY` | CoreSystem | `{}` |
| `BOT_SPAWNED` | Agent | `{ name, world_id }` |
| `THREAT_DETECTED` | EnvironmentMonitor | `{ entity, position }` |
| `HEALTH_CRITICAL` | CoreSystem | `{ health: 0-6 }` |
| `HUNGRY` | CoreSystem | `{ food: 0-6 }` |
| `TASK_FAILED` | TaskScheduler | `{ task, error, fatal }` |
| `DEATH` | Bot listener | `{ position, killer }` |

### 3.2 TaskScheduler (`src/agent/core/TaskScheduler.js`)
- Priority tiers: SURVIVAL(100) > USER(80) > WORK(50) > BACKGROUND(10)
- One blocking task at a time. Priority ≥ 100 triggers interrupt.
- Zombie killer: kills tasks running > 60s.

### 3.3 Blackboard (State)
```json
{
  "self_state": { "health": "0-20", "food": "0-20", "is_alive": "boolean" },
  "inventory_cache": { "totem_count": "number", "food_level": "0-20" },
  "strategic_data": { "current_mission": "string", "death_count": "number" },
  "social_context": { "owner_name": "string", "trusted_players": "string[]" }
}
```

---

## 4. Action Layer

All primitives in `src/actions/core/ActionAPI.js`. Params are **always a single object**.

| Method | Params | Returns |
|--------|--------|---------|
| `mine` | `{ targetBlock: Block, options: {retries?, baseDelay?} }` | `{ success, attempts, error? }` |
| `craft` | `{ itemName: string, count, options }` | `{ success, action, attempts }` |
| `smelt` | `{ itemName: string, count, options }` | `{ success, attempts, error? }` |
| `place` | `{ blockType, position, options }` | `{ success, attempts, error? }` |
| `moveto` | `{ position: {x,y,z}, options: {minDistance?, timeoutMs?} }` | `{ success, attempts, error? }` |
| `eat` | `{ itemName?, options }` | `{ success, action, error? }` |
| `attack` | `{ entity, options }` | `{ success, attempts, error? }` |

### Action Chain
`executeChain(steps[], context)` — sequential step processor. Supports `${LocalVar}` and `${BB.path}` interpolation.

---

## 5. Reflexes (Fast Reactions, <20ms)

Located in `src/agent/reflexes/` and `src/reflexes/core/ReflexSystem.js`:

| Reflex | What It Does |
|--------|-------------|
| `CombatReflex` | Tactical strafing/kiting, single-target focus |
| `SelfPreservation` | Auto-retreat at health < 6, swimming if drowning |
| `StuckReflex` | Jump-unstick if movement delta < 0.1 over 100 ticks |
| `FallDamageReflex` | MLG water bucket (needs water_bucket in hotbar) |
| `Watchdog` | Kills zombie tasks > 60s |

---

## 6. Skills (What the Bot Can Execute)

Located in `src/skills/library/`:

| Skill | File | Status |
|-------|------|--------|
| Wood gathering | `gather_wood.js` | ✅ Working |
| Crafting | `craft_items.js` | ✅ Working |
| Smelting | `smelt_items.js` | ✅ Working |
| Ore mining | `mine_ores.js` | ✅ Working |
| Resource gathering | `gather_resources.js` | ✅ Working |
| Shelter finding | `find_shelter.js` | ✅ Working |
| Eating | `eat_food.js` | ✅ Working |
| Combat | `combat_skills.js` | ✅ Working |
| Navigation | `go_to.js` | ✅ Working |
| Follow player | `follow_player.js` | ✅ Working |
| Block placement | `place_blocks.js` | ✅ Working |

---

## 7. Evolution & Learning

- **GeneEngine**: Tunes bot parameters (±20% of baseline per generation)
- **ProactiveCurriculum**: Sets goals when idle based on inventory analysis
- **EvolutionEngine**: Listens to `TASK_FAILED`/`DEATH`, creates new reflexes
- **ReflexCreatorEngine**: Generates dynamic reflexes from failure analysis
- **CodeSandbox**: `isolated-vm`, 64MB, 2000ms timeout for eval

---

## 8. Known Limitations (Honest)

| Issue | Severity | Detail |
|-------|----------|--------|
| Ocean biome loop | Medium | `gather_wood` scouts infinitely in oceans — no biome check |
| No Nether support | Low | Doesn't target crimson/warped stems |
| `agent.js` monolith | Medium | 2000+ lines, hard to maintain |
| No test runner | Low | 15 test files but no Jest/Vitest configured |

---

## 9. All Active Modules

| Module | File | Purpose |
|--------|------|---------|
| SwarmSync | `core/SwarmSync.js` | Multi-bot coordination |
| CombatAcademy | `core/CombatAcademy.js` | Combat pattern training |
| PlayerTrainingMode | `core/PlayerTrainingMode.js` | Player teaching |
| AdventureLogger | `core/AdventureLogger.js` | Activity logging |
| ChatInstructionLearner | `core/ChatInstructionLearner.js` | Learn from chat commands |
| Profiler | `core/Profiler.js` | Performance tracking |
| CoreExtractor | `core/CoreExtractor.js` | Data extraction |
| AutoHealer | `core/AutoHealer.js` | Auto healing |
| ReplayBuffer | `core/ReplayBuffer.js` | Experience replay |
| ToolCreatorEngine | `core/ToolCreatorEngine.js` | Dynamic tool creation |

---

## 10. Rules for Modifying This Bot

1. **ALL `ActionAPI` calls use a single params object** — never positional args.
2. **`async`/`await` everywhere** — ActionAPI is always async.
3. **Signal listeners are sync** but may schedule async tasks.
4. **Skills return `{ success: boolean, message: string }`** — always.
5. **Don't modify kernel files** unless fixing a verified crash.

---
**LAST UPDATED: 2026-02-22**
