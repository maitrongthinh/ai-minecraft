# MindOS System Overview (Current Runtime)

Last updated: 2026-02-10

## 1. Scope
This document describes the current architecture that is actually running in `src/`.
It replaces old references to `DualBrain` and old state-stack-only designs.

## 2. Runtime Topology

### 2.1 Process layout
- `main.js`: boots MindServer and creates one or more agent processes from profiles.
- `src/mindcraft/mindserver.js`: websocket control plane and UI state stream.
- `src/process/init_agent.js`: boot entrypoint for each agent process.
- `src/agent/agent.js`: main runtime host for cognition, reflexes, memory, actions.

### 2.2 Core control flow
1. Agent loads merged config from `settings.js` + profile.
2. `CoreSystem` initializes memory, scheduler, reflex bus listeners.
3. Agent connects to Minecraft (`localhost:5000` by default in `settings.js`).
4. On spawn, heavy subsystems load:
   - `CogneeMemoryBridge`
   - `SkillLibrary` + `SkillOptimizer`
   - `ToolRegistry` discovery
   - `AdventureLogger` (daily journal writer + optional screenshot capture)
   - `UnifiedBrain` rebind with memory + skills
   - `DeathRecovery` + `Watchdog`
5. Agent state switches to `READY` and starts normal operation.

## 3. Main Modules

### 3.1 Core and scheduling
- `src/agent/core/CoreSystem.js`: kernel bootstrap, safeguards, lifecycle.
- `src/agent/core/TaskScheduler.js`: priority execution and interruption (`SURVIVAL`, `USER`, `WORK`, `BACKGROUND`).
- `src/agent/core/SignalBus.js`: event bus between modules.

### 3.2 Intelligence and planning
- `src/brain/UnifiedBrain.js`: fast chat + high IQ planning + strategic prompt injection.
- `src/agent/orchestration/System2Loop.js`: planner/critic/executor slow loop, degradation and recovery.
- `src/agent/Arbiter.js`: idle arbitration, safety gates, objective trigger.
- `src/agent/core/AdventureLogger.js`: in-game daily summary generation and markdown persistence.

### 3.3 Action execution
- `src/agent/action_manager.js`: controlled execution with timeout and interruption.
- `src/agent/core/ActionAPI.js`: retry-aware primitives:
  - `mine`
  - `craft`
  - `place`
  - `smelt`

### 3.4 Reflex and survival
- `src/agent/reflexes/CombatReflex.js`: combat loop, LOS checks, retreat logic.
- `src/agent/reflexes/SelfPreservationReflex.js`: drowning/burning/suffocation/low-health handling.
- `src/agent/reflexes/DeathRecovery.js`: persistent death waypoint recovery.
- `src/agent/reflexes/Watchdog.js`: stuck detection and emergency movement reset.

### 3.5 Memory and skills
- `src/agent/memory/MemorySystem.js`: RAM chat/errors/places + query routing.
- `src/memory/CogneeMemoryBridge.js`: graph-memory service bridge with fallback to vector store.
- `src/skills/SkillLibrary.js`: file-based skills and hot-swap support.
- `src/agent/core/ToolRegistry.js`: MCP-style skill discovery + schema validation.
- `src/agent/core/EvolutionEngine.js`: failure-to-skill conversion and dynamic registration.

### 3.6 Dashboard and observability
- `src/mindcraft/public/index.html`: web dashboard with tabs for Chat, Thought Process, Adventure Log.
- `src/mindcraft/mindserver.js`: relay channels for `bot-output`, `bot-thought`, `system2-trace`, `adventure-log`.
- `src/agent/mindserver_proxy.js`: transport helpers for structured thought and journal events.

## 4. Strategic objective
- Global objective is configured in `settings.js`:
  - `objective: "Beat Minecraft"`
- `UnifiedBrain` injects this objective into planning context.
- `Arbiter` triggers self-prompter when idle to keep long-term momentum.

## 5. Dependency and coupling rules
- Conversation to MindServer communication is transport-injected (`setBotChatTransport`) to avoid static cycles.
- MindServer control API uses callback injection in `createMindServer(...)` so server and process manager are decoupled.
- Full state assembly does not import conversation internals directly; in-game agent list is passed in.

## 6. Reliability behavior
- Retry wrappers are used in ActionAPI and Cognee bridge.
- Scheduler interrupts low-priority physical work for critical survival events.
- Evolution engine captures failures and attempts runtime skill evolution.
- Watchdog and death recovery provide autonomous unstuck and post-death continuity.
- Torch placement light checks fall back to block/sky light when world light API is unstable.

## 7. Current known limit
- This architecture is hardened for stability, but full "Beat Minecraft" completion still depends on long-horizon strategy quality, world seed constraints, and external model reliability.
