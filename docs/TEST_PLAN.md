# MindOS Test Plan (Production Readiness)

Last updated: 2026-02-10
Target server: `localhost:5000`
Grand goal: `Beat Minecraft`

## 1. Pre-flight

Run once before test:

```powershell
node --version
npm install
```

Required services:
- Minecraft server on `localhost:5000`
- Optional memory service on `http://localhost:8001` (Cognee bridge)

## 2. Static integrity checks (Phase 1)

## 2.1 Syntax sweep
```powershell
node tests/syntax_check.js
```
Expected: all checked modules parse successfully.

## 2.2 Core configuration and startup checks
```powershell
node tests/test_settings.js
node tests/test_agent.js
```
Expected: settings load and agent boot flow sanity passes.

## 2.3 Circular dependency check
Run the local cycle scan script or equivalent import-graph scan for `src/`.
Expected: no relative import cycles in production path.

## 3. Action API and reflex hardening (Phase 2)

## 3.1 Action API retries
```powershell
node tests/integration/test_action_api.js
```
Coverage:
- `mine`
- `craft`
- `place`
- `smelt`
- retry behavior and failure envelope

## 3.2 MCP skills and registry discovery
```powershell
node tests/integration/test_mcp_skills.js
node tests/skills/test_skill_system.js
```
Expected:
- MCP-compatible skills discovered and callable
- metadata schema and parameter validation enforced

## 3.3 Survival reflexes
```powershell
node tests/integration/test_death_recovery.js
```
Manual runtime checks in-game:
- low health and hunger response
- combat engage and retreat behavior
- death waypoint recovery without infinite loop

## 4. Intelligence and memory integration (Phase 3)

```powershell
node tests/agent/test_cognee_integration.js
node tests/integration/test_evolution_integration.js
```

Validation points:
- UnifiedBrain can run with/without Cognee service
- memory store/recall path is functional
- evolution pipeline can register generated skills into ToolRegistry

## 5. Full survival simulation (Phase 4)

## 5.1 Launch
```powershell
node main.js
```

Observe during live run:
- login and spawn stability
- initial resource behavior (wood/stone progression)
- first-night decision quality (shelter, mining, or safe fallback)
- interruption handling: attack during a work task and verify resume behavior
- death recovery continuity

## 5.2 Runtime evidence to capture
- console logs for:
  - `ACTION_FAILED`
  - `TASK_FAILED`
  - `SYSTEM2_DEGRADED`
  - `skill.learned` or evolution events
- bot state from MindServer UI (`agents-status`, full-state stream)

## 6. Exit criteria for production candidate
A build is a candidate when:
- core tests pass
- no startup crash regressions
- no circular import regressions in runtime modules
- action API retry paths are stable
- reflexes do not deadlock agent control
- bot can recover from death/stuck state and keep progressing objective

Note: "100% guaranteed beat every run" is not realistic for stochastic worlds and external model variability. The practical production target is high resilience, safe fallback behavior, and automatic recovery from common failures.
