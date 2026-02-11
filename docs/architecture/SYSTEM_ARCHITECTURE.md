# MindOS Technical Architecture (Production-Oriented)

Version: 2026-02-10
Status: Active runtime reference

## 1. Architectural style
MindOS uses an event-driven, multi-loop architecture:
- Fast loop: reflex and safety actions.
- Slow loop: planning, critique, and execution refinement.
- Meta loop: evolution from failures into reusable skills.

The central integration point is `SignalBus`, while task execution authority is managed by `TaskScheduler`.

## 2. Layered model

## Layer A: Runtime host
- `src/agent/agent.js`
- Owns lifecycle state, Minecraft connection, subsystem wiring, and shutdown.

## Layer B: Kernel
- `src/agent/core/CoreSystem.js`
- `src/agent/core/SignalBus.js`
- `src/agent/core/TaskScheduler.js`

Responsibilities:
- initialize core memory/scheduler/reflex listeners
- provide priority-based task arbitration
- run safeguards (zombie checks, stuck watchdog hooks)

## Layer C: Cognition
- `src/brain/UnifiedBrain.js`
- `src/agent/orchestration/System2Loop.js`
- `src/agent/Arbiter.js`
- `src/agent/core/AdventureLogger.js`

Responsibilities:
- handle chat vs planning routing
- enforce strategic objective context
- manage degrade/recover behavior for slow-loop failures
- generate daily narrative summaries + screenshots for user-facing observability

## Layer D: Body and reflex
- `src/agent/action_manager.js`
- `src/agent/core/ActionAPI.js`
- `src/agent/reflexes/*.js`

Responsibilities:
- deterministic action execution with timeout/interruption
- retry-capable primitive actions (`mine`, `craft`, `place`, `smelt`)
- autonomous reaction to threats and hazards

## Layer E: Memory and evolution
- `src/agent/memory/MemorySystem.js`
- `src/memory/CogneeMemoryBridge.js`
- `src/skills/SkillLibrary.js`
- `src/agent/core/EvolutionEngine.js`
- `src/agent/core/ReplayBuffer.js`

Responsibilities:
- short-term history + tick-perfect activity capture (50ms)
- skill registration, schema-validated execution, and retroactive self-refactoring (Adversarial Learning)

## Layer F: Sovereign Swarm (v2.5)
- `src/agent/core/SwarmSync.js`
- `src/agent/core/PathfindingWorker.js`

Responsibilities:
- Zero-Trust P2P communication (Sigma Protocol) over whispers
- Distributed target acquisition and flocking behavior
- Offloaded pathfinding via Worker Threads for main-loop stability

## 3. Key runtime sequence

1. `main.js` starts MindServer and spawns agent process.
2. Agent constructs base systems (`CoreSystem`, `UnifiedBrain`, reflex handlers).
3. Agent connects to Minecraft and waits for spawn.
4. Post-spawn heavy init loads memory bridge, skill library, tool registry.
5. Adventure logger initializes output directory and day tracking.
6. State flips to `READY`.
6. Normal cycle:
   - signals emitted from sensors and events
   - scheduler arbitrates tasks
   - reflex preempts unsafe work
   - brain plans and executes
   - memory stores outcomes
   - dashboard streams chat/thought/adventure traces in realtime

## 4. Event model (selected)

Important `SignalBus` events:
- survival: `health.critical`, `health.low`, `death`, `threat.detected`
- actions: `action.started`, `action.completed`, `action.failed`
- tasks: `task.failed`, `task.completed`
- evolution: `skill.failed`, `skill.learned`, `skill.registered`
- cognition: `system2.planning_start`, `system2.degraded`, `system2.recovered`

Failure policy:
- listeners are isolated; one handler failure does not crash the bus.
- async listener rejections are trapped and logged.

## 5. Priority and interruption
`TaskScheduler` priorities:
- 100: survival (interrupts physical work)
- 80: user intent
- 50: work tasks
- 10: background maintenance

Critical tasks can preempt ongoing non-parallel actions. Non-critical tasks are queued by dynamic priority.

## 6. Memory architecture

### 6.1 Short-term and structured memory
`MemorySystem` stores:
- turns (chat history)
- errors
- RAM key-value places (`setPlace`/`getPlace`)

### 6.2 Long-term memory bridge
`CogneeMemoryBridge`:
- writes experiences to service API (`/remember`)
- recalls with query (`/recall`)
- retries with exponential backoff
- falls back to local vector store when service is degraded

## 7. Evolution architecture
`EvolutionEngine` listens to task/skill failures, captures snapshot context, requests fix code, validates sandbox constraints, deploys skill into `SkillLibrary`, and registers metadata with `ToolRegistry` for future use.

## 8. Coupling constraints and cycle prevention
Current rules implemented in code:
- conversation transport is injected (`setBotChatTransport`) to avoid direct conversation-server circular imports.
- MindServer creation receives callback handlers instead of importing process functions directly.
- full-state generation receives in-game agents list as argument, avoiding hidden cross-module dependency.

## 9. Future Roadmap: Toward Phase 5 (Singularity)
Based on the [Optimization Manual](../guides/OPTIMIZATION_MANUAL.md):
1. **Memory Hardening**: Implementing `isolated-vm` for multi-isolate code execution.
2. **ReAct Integration**: UnifiedBrain will transition to strict Thought-Action sequences.
3. **Adaptive Context**: Token-saving environment compression for longer horizon planning.
4. **SLM Sub-Agents**: Local Llama-3 integration for cost-saving trivial task processing.
5. **Deduplication**: Vector-store similarity checks for Skill Library maintenance.

## 10. Production hardening checklist
- Ensure `settings.js` objective is set correctly (`Beat Minecraft`).
- Keep watchdog and retries configured for server latency profile.
- Keep Cognee service healthy (`http://localhost:8001`) or validate fallback path.
- Keep skills schema-valid so ToolRegistry can discover/execute reliably.
- Monitor `task.failed` and `action.failed` rates to detect degradation early.
- Validate dashboard receives `system2-trace` and `adventure-log` events from live agents.
- For local-only deployments, use `profiles/llama.json` (Ollama endpoint) to remove external quota dependency.
