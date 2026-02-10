# Live Stability Report (Keytest 14-18)

Date: 2026-02-10  
Environment: `localhost:5000`  
Objective: `Beat Minecraft`

## 1) Critical findings and fixes

### A. False-negative `collect_drops` caused loop-fail storms
- Symptom: deterministic fallback repeatedly failed with `[collect_drops] failed`.
- Root cause: `collectDroppedItems` returned `success: false` when no dropped items existed.
- Fix:
  - `src/agent/core/ActionAPI.js`
  - No-item state now returns success with `skipped: true`.

### B. `goToNearestBlock` and `goToNearestEntity` returned success when movement failed
- Symptom: bot reported shelter found but remained stuck, leading to fake progress loops.
- Root cause: movement result from `goToPosition` was ignored.
- Fix:
  - `src/skills/library/movement_skills.js`
  - Both functions now return actual movement result.

### C. Repeated resource deadlock (`gather_wood` -> no progress)
- Symptom: long loops on `gather_wood` with poor pathing and no resource gain.
- Root cause: target selection could focus unreachable logs; no scouting step when local area was empty.
- Fix:
  - `src/skills/library/gather_wood.js`
  - Added reachable-first target scoring, blocked-target blacklist, dig reach checks, drop collection, and scouting movement rings.

### D. Model-generated invalid API calls (`movement_skills`, `world.inspect`, malformed `gather_resources` / `craft_items`)
- Symptom: code execution failures from unsupported or malformed calls.
- Fix:
  - `src/agent/agent.js`
  - Added runtime task sanitizer to rewrite unsupported/broken task code into deterministic fallback actions.
  - Added explicit sanitize path for broken `craft_items` calls (`item: undefined`).

### E. `gather_resources` parameter mismatch handling
- Symptom: `Unknown resource type: undefined` and `Unknown resource type: oak_log`.
- Fix:
  - `src/skills/library/gather_resources.js`
  - Added resource normalization, wood aliases, default fallback to `wood`, and multi-log block matching.

### F. Craft progression fragility with partial materials
- Symptom: early craft steps failed often when requested count exceeded current materials.
- Fix:
  - `src/agent/core/ActionAPI.js`
  - `craftFirstAvailable` now degrades requested count (`N -> N/2 -> 1`).
  - `ensureItem` now pre-converts logs to planks when ensuring `crafting_table`/`stick`.

### G. Strategic prompt day/night edge-case misclassification
- Symptom: time values near dawn (>=23000) were framed like sunset, biasing planner into unnecessary shelter loops.
- Fix:
  - `src/prompts/StrategicPrompts.js`
  - Added explicit `dawn` and `sunset window` time buckets.

## 2) Live run summary

### Keytest 15
- Result: high failure loop.
- Notable metrics:
  - `total_tasks: 43`
  - `code_failed: 34`
  - `gather_wood` and malformed API tasks dominated failures.

### Keytest 16
- Result: runtime failures removed, but still shelter-loop heavy.
- Notable metrics:
  - `total_tasks: 37`
  - `code_failed: 0`
  - no unsupported API failures, no gather_resources unknown-type failures.

### Keytest 17
- Result: first clear progression beyond shelter loop into wood/crafting flow.
- Notable observations:
  - successful wood movement traces
  - one malformed `craft_items` call (fixed later by sanitizer patch)
  - provider transient 500 still occurs intermittently.

### Keytest 18
- Result: stable execution session after craft sanitizer + resource normalization.
- Notable metrics:
  - `total_tasks: 15`
  - `code_failed: 0`
  - `craft_items_unknown: 0`
  - `gather_resources_unknown: 0`
  - `unsupported_api_failures: 0`

## 3) Test validation (post-fix)

Passed:
- `node tests/syntax_check.js`
- `node tests/test_agent.js`
- `node tests/test_settings.js`
- `node tests/integration/test_action_api.js`
- `node tests/integration/test_mcp_skills.js`
- `node tests/integration/test_evolution_integration.js`
- `node tests/agent/test_cognee_integration.js`

## 4) Remaining production blockers

1. External provider intermittently returns HTTP `500` (transient degradation still possible).
2. Bot still spends too many cycles on shelter-first logic when night conditions persist.
3. Craft progression depends on actual resource availability in spawn area and can still stall in sparse terrain.

## 5) Current status

- Runtime stability: significantly improved.
- Reflex/action hardening: improved with deterministic fallback and reduced invalid-call failures.
- Autonomous reliability: improved, but not yet equivalent to guaranteed full objective completion in every run.
