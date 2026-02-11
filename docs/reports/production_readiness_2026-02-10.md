# MindOS Production Readiness Audit

Date: 2026-02-10
Target: localhost:5000
Objective: Beat Minecraft

## 1) High severity findings and hotfixes

### F1 - Combat reflex crash during runtime
- Symptom: process crash with `Cannot read properties of null (reading 'entities')` in `CombatReflex.findNearbyHostiles`.
- Root cause: stale/null bot reference inside `CombatReflex` during event handling/reconnect windows.
- Fix:
  - `src/agent/reflexes/CombatReflex.js`
  - Added `_syncBot()` and defensive guards across combat methods.
  - Ensured hostile scans and distance checks are null-safe.
- Verification:
  - live simulation re-run: no recurrence of the null bot crash.

### F2 - Memory success event hook mismatch
- Symptom: success events were not being absorbed into memory.
- Root cause: subscribed to `SIGNAL.TASK_COMPLETE` while bus uses `SIGNAL.TASK_COMPLETED`.
- Fix:
  - `src/agent/memory/MemorySystem.js`
  - Corrected subscription key.
- Verification:
  - static run and regression tests pass.

### F3 - Cognee recall object handling mismatch
- Symptom: graph recall path in `MemorySystem.query` could miss valid recall data.
- Root cause: assumed `recall()` returns array, but bridge returns structured object.
- Fix:
  - `src/agent/memory/MemorySystem.js`
  - Normalized recall response to extract `results` when response is object.
- Verification:
  - `tests/agent/test_cognee_integration.js` pass.

### F4 - Provider failure request storm in self-prompt loop
- Symptom: repeated `403 Quota exceeded` loops could spam requests.
- Fix:
  - `src/brain/UnifiedBrain.js`
    - Added provider degradation tracking (`providerDegraded`).
    - Mark failure on disconnected provider responses.
  - `src/agent/agent.js`
    - Skip follow-up plan loop when provider is degraded.
  - `src/agent/self_prompter.js`
    - Pause self-prompt early on degraded provider.
- Verification:
  - live run now pauses after 2 failed requests (previously significantly higher).

## 2) Architecture and docs normalization

Rewritten for current runtime (removed stale DualBrain docs and encoding corruption):
- `docs/architecture/system_overview.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/TEST_PLAN.md`
- `docs/concepts/SELF_EVOLUTION.md`

## 3) Structural checks

- Relative import cycle scan in `src/`: PASS (no cycles).
- Full syntax sweep: PASS (`src/**/*.js`, 135 files).

## 4) Automated test results

All passed:
- `node tests/test_settings.js`
- `node tests/test_agent.js`
- `node tests/syntax_check.js`
- `node tests/integration/test_mcp_skills.js`
- `node tests/integration/test_evolution_integration.js`
- `node tests/integration/test_action_api.js`
- `node tests/integration/test_death_recovery.js`
- `node tests/agent/test_cognee_integration.js`
- `node tests/skills/test_skill_system.js`

## 5) Live simulation observations (localhost:5000)

Observed:
- Agent login/spawn successful.
- Heavy subsystem init complete (`Vision`, `Cognee bridge`, `SkillLibrary`, `ToolRegistry`).
- Agent reached READY state and started autonomous objective loop.

Blocked behavior:
- External model endpoint returned `403 Quota exceeded`.
- This blocks strategic planning progression despite runtime stability.
- New guard now pauses self-prompt quickly to avoid storming the provider.

## 6) Production gate status

- Core runtime stability: improved and acceptable for guarded deployment.
- Reflex/action reliability: improved, no combat null crash recurrence.
- Memory/evolution wiring: functional in tests.
- Full "Beat Minecraft" completion: blocked by provider quota/external model availability.

## 7) Immediate operator actions required

1. Restore valid model quota/key for configured endpoint.
2. Re-run long-horizon survival simulation (>= 2 hours) to validate progression milestones:
   - early wood/stone gathering
   - first-night shelter strategy
   - combat interruption and task resume
   - death recovery continuity
3. Optionally enable watchdog in settings for stricter anti-stuck behavior in production.

## 8) 2026-02-10 runtime hardening update (QUANGDZ key session)

Key/config:
- `QUANGDZ_API_KEY` updated.
- `models.high_iq.uses` and `models.fast.uses` set to `1000` in `settings.js`.
- `src/models/gpt.js` now sends `uses` from model params and retries transient provider failures.

Additional hotfixes:
- `src/agent/intelligence/CodeEngine.js`
  - Increased code execution timeout fallback to `90000ms`.
  - Added bound-skill invocation and proxy fallback to prevent runtime crashes when model calls skills with wrong signature.
- `src/skills/library/gather_wood.js`
  - Added movement-to-target, per-step timeouts, runtime safety cap, and per-run cap to reduce long action stalls.
- `src/skills/library/gather_resources.js`, `src/skills/library/mine_ores.js`, `src/skills/library/craft_items.js`, `src/skills/library/place_blocks.js`, `src/skills/library/smelt_items.js`
  - Hardened to accept both `agent` and raw `bot`.
  - Fixed craft path to use valid recipe flow.
  - Added missing parameter guards for place/smelt/craft entry points.
- `src/skills/library/interaction_skills.js`, `src/skills/library/world.js`
  - Added guards for optional `bot.modes` access to remove `isOn` crashes.
- `src/agent/self_prompter.js`
  - Replaced immediate pause on repeated responses with forced `UNSTUCK MODE` strategy switch.

Validation summary:
- Automated tests pass (settings, syntax, action API, MCP skills, evolution integration, death recovery, cognee static checks).
- Live run logs (`live_run_keytest5` ... `live_run_keytest10`) confirm removal of prior critical runtime crashes:
  - no `bot.find_shelter is not a function`
  - no `skills.StrategicMovement is not a function` after proxy fix
  - no `place_blocks` `isOn` null crashes
  - no repeated `ActionTimeout` regressions in final run
- Provider instability (intermittent `500`) remains external; retry behavior now masks transient failures better.

## 9) Extended live hardening cycle (keytest14..keytest18)

Detailed report:
- `docs/reports/live_stability_2026-02-10_keytest18.md`

Highlights:
- Removed repeated runtime failures from malformed model task code via task sanitization.
- Hardened `gather_wood` and `gather_resources` for parameter and exploration robustness.
- Fixed movement helpers that previously reported success even when navigation failed.
- Reduced failure-heavy loops from keytest15 to stable zero-failure execution runs in keytest18.

## 10) UX + Collaboration + Local Model hardening (2026-02-10 night patch)

Implemented:
- Dashboard tabs in `src/mindcraft/public/index.html`:
  - `Chat`
  - `Thought Process` (includes structured `system2-trace`)
  - `Adventure Log`
- New realtime relays in `src/mindcraft/mindserver.js`:
  - `system2-trace`
  - `adventure-log`
  - static serving for `/bots/*` artifacts
- Agent transport extensions in `src/agent/mindserver_proxy.js` for structured traces and adventure entries.
- Structured phase tracing (`plan -> critic -> execute`) emitted from:
  - `src/agent/orchestration/System2Loop.js`
  - main planning runtime in `src/agent/agent.js`
- Daily journal subsystem:
  - `src/agent/core/AdventureLogger.js`
  - writes markdown snapshots to `bots/<agent>/adventure`
  - captures screenshot when vision camera is available
- Assist/Collaborator mode controls in `src/agent/agent.js`:
  - deterministic owner-aware errands
  - auto-switch to assist when addressed (`Hey MindOS ...`) by owner
  - teammate sync hook for collaborator mode
- Torch light detection hardening in `src/skills/library/world.js`:
  - fallback from `world.getLight` to block/sky light and day/night heuristic.
- Local Llama profile switched to Ollama default in `profiles/llama.json` (`ollama/llama3.1:8b`).

Status update on prior blockers:
- External provider 403/500 remains intermittent and is still the only hard external dependency blocker for long-horizon strategy.
- Light sensing TODO is now covered by runtime fallback path (no longer hard-broken when `getLight` is unreliable).
