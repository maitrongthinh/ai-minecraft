# MIND-SYNC RUNTIME ARCHITECTURE (STABLE v3.1 FINAL)

> [!IMPORTANT]
> **RUNTIME CONTRACT NOTICE**
> This document is a reality-aligned reconstruction of the MIND-SYNC bot architecture. Every component, signal, and module described herein has been verified in the codebase. 
> 
> **STRICT ARCHITECTURAL GUARDRAILS**:
> 1. **Existence Rule**: If an API, signal, or module is not explicitly listed in this document, it must be assumed to NOT exist.
> 2. **Expansion Rule**: This document defines runtime truth. AI agents must NOT expand architecture or hallucinate capabilities beyond this file.
> 3. **Immutability Guard**: Files within `src/agent/core/*` (Kernel) are immutable. Modifications are restricted to the EvolutionEngine pipeline.

---

## 1. System Entry Point & Boot Sequence

The system entry point is `src/agent/Agent.js`. Initialization is a phase-based deterministic sequence.

### Phase 1: Environment Sync (Synchronous)
- **Configuration**: `settings.js` is loaded and merged with `StandardProfileSchema.js`.
- **API Setup**: Model aliases are resolved; API keys are injected from `env`.

### Phase 2: Kernel Boot (Asynchronous)
1. **`TaskScheduler`**: Central pulse initialized. Creates the `Blackboard`.
2. **`MemorySystem`**: Initializes `VectorStore.js` and chat history persistence.
3. **`EnvironmentMonitor`**: Starts the proactive sensor loop.
4. **`PerceptionManager`**: Initializes `VisionScheduler` for world polling.
5. **`ReflexSystem`**: System 1 (Amygdala) initialized with 50ms tick rate.
6. **`ToolRegistry`**: Auto-discovers behavioral skills in `src/skills/library/`.
7. **`EvolutionEngine`**: Attaches to `SIGNAL.TASK_FAILED` and `SIGNAL.DEATH` for retrospective analysis.

### Phase 3: Bot Correlation (Asynchronous)
- **Mineflayer Instance**: Bot initialized via `utils/mcdata.js`.
- **Signal Bus Binding**: Bot vitals and event listeners are wired to `globalBus`.
- **MotorCortex Bridge**: `MotorCortex` is attached to the bot instance for neuromorphic control.

---

## 2. Kernel & SignalBus (Nervous System)

### 2.1 SignalBus Ownership (`src/agent/core/SignalBus.js`)
Only the **Core layer** (Kernel) may emit `SYSTEM_*` and `BOT_*` signals. 

| Signal Enum | Emission Source | Typical Payload Shape |
| :--- | :--- | :--- |
| `SYSTEM_READY` | `CoreSystem` | `{}` |
| `BOT_SPAWNED` | `Agent` | `{ name: string, world_id: uuid }` |
| `THREAT_DETECTED` | `EnvironmentMonitor` | `{ entity: Entity, position: Vec3 }` |
| `HEALTH_CRITICAL` | `CoreSystem` (Watchdog) | `{ health: 0-6 }` |
| `HUNGRY` | `CoreSystem` (Watchdog) | `{ food: 0-6 }` |
| `TASK_FAILED` | `TaskScheduler` | `{ task: string, error: string, fatal: boolean }` |
| `DEATH` | `Bot Event Listener` | `{ position: Vec3, killer: string\|null }` |
| `BLACKBOARD_UPDATE` | `Blackboard` | `{ path: string, value: any, source: string }` |

### 2.2 TaskScheduler Constraints
- **Concurrency**: One non-parallel task permitted per priority tier.
- **Interruption**: Priority $\ge 100$ triggers `interruptPhysicalTasks()`.
  - **Effect**: Calls `bot.pathfinder.setGoal(null)`, `bot.stopDigging()`, and aborts the active `TaskController`.

---

## 3. State Anchoring: Blackboard Schema

**State Mutation Rules**:
- **Mutators**: `CoreSystem` (vitals/inventory) and `ActionAPI` (chain ops).
- **Read-Only**: System 2 Planning and Skill Library must use `blackboard.get()`.
- **Atomicity**: Updates must be performed via `blackboard.set(path, value, source)`.

```json
{
  "meta": { "version": "3.1.0", "last_update": "timestamp" },
  "system_flags": {
    "network_status": "connected|disconnected",
    "is_combat_mode": "boolean",
    "is_sleeping": "boolean",
    "maintenance_mode": "boolean"
  },
  "strategic_data": {
    "home_coordinates": "{x, y, z} | null",
    "current_mission": "string",
    "death_count": "number"
  },
  "social_context": {
    "owner_name": "string",
    "trusted_players": "string[]",
    "enemies": "string[]"
  },
  "inventory_cache": {
    "totem_count": "number",
    "food_level": "0-20",
    "main_hand": "item_name | null"
  },
  "self_state": {
    "health": "0-20",
    "food": "0-20",
    "is_alive": "boolean"
  },
  "system2_state": {
    "active_goal": "string | null",
    "plan_phase": "idle|planning|executing",
    "last_failure": "string | null"
  }
}
```

---

## 4. Action Layer: High-Fidelity API

All primitive actions are implemented in `src/actions/core/ActionAPI.js`.

### 4.1 Primitive Method Signatures
| Method | Params Shape | Returns (Promise) |
| :--- | :--- | :--- |
| `moveto` | `{ position: {x,y,z}, options: {minDistance?:2, timeoutMs?:25000, retries?:1} }` | `{ success: boolean, attempts: number, error?: string }` |
| `mine` | `{ targetBlock: Block, options: {retries?:2, baseDelay?:250} }` | `{ success: boolean, attempts: number, error?: string }` |
| `place` | `{ blockType: string, position: Vec3, options: {placeOn?:'bottom', dontCheat?:false} }` | `{ success: boolean, attempts: number, error?: string }` |
| `craft` | `{ itemName: string, count: number, options: {craftingTable?:Block} }` | `{ success: boolean, action: 'craft', attempts: number }` |
| `ensure_item`| `{ itemName: string, targetCount: number, options: {} }` | `{ success: boolean, count: number, needed: number }` |
| `attack` | `{ entity: Entity, options: {retries?:1, baseDelay?:400} }` | `{ success: boolean, attempts: number, error?: string }` |
| `eat` | `{ itemName?: string, options: {retries?:1} }` | `{ success: boolean, action: 'eat', error?: string }` |

### 4.2 Action Chain Contract
`executeChain(chain: Step[], context: Object)` processes steps sequentially.
- **Step Shape**: `{ type: 'ACTION_API'|'BLACKBOARD_OP'|'WAIT', name: string, params: Object, if?: Condition, store_as?: string }`
- **Variable Interpolation**: Supports `${LocalVar}` and `${BB.path.to.key}`.

---

## 5. System 1 & System 2 Boundaries

### 5.1 System 1: Reflexes (`src/agent/reflexes/`)
Reflexes are **blocking-synchronous** on the tick and must complete within 20ms.
- **`CombatReflex`**: Tactical strafing/kiting. Single-target focus.
- **`SelfPreservationReflex`**: Auto-retreat at $health < 6$.
- **`StuckReflex`**: Jump-unstick if movement delta < 0.1 over 100 ticks.
- **`FallDamageReflex`**: MLG water bucket (requires `water_bucket` in hotbar).
- **`Watchdog`**: Zombie Killer. Kills tasks running $> 60s$.

### 5.2 System 2: Evolution & Safety
- **Evolution Tuning**: Limits parameter adjustments to $\pm 20\%$ of baseline.
- **Code Sandbox**: `isolated-vm` enforced. 64MB RAM, 2000ms timeout for script evaluation.

---

## 6. Skill Library Catalog

| Category | Anchor Path | Functional Ownership |
| :--- | :--- | :--- |
| **Movement** | `library/go_to.js` | Pathfinder goals and player proximity. |
| **Survival** | `library/gather_wood.js` | Logic for tree harvesting and plank tiering. |
| **Economics** | `library/craft_items.js` | Furnace and Crafting Table management. |
| **Tactics** | `library/combat_skills.js` | High-level battle engagement logic. |

---

## 7. Operational Constraints
- **UNKNOWN API RULE**: If a function or key is not in this document, it does NOT exist.
- **SYNC/ASYNC BOUNDARY**: All `ActionAPI` calls are `async`. Reaction listeners (signals) are synchronous but may schedule `async` tasks.
- **CORE IMMUTABILITY**: Do NOT modify `src/agent/core/` files. Only `src/skills/library/` and `src/agent/reflexes/` may be evolved.

---
**DOCUMENT END**
**MIND-SYNC v3.1: FINAL STABLE BLUEPRINT**
**LAST AUDIT: 2026-02-19**
