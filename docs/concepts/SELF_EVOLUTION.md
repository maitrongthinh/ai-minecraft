# Self-Evolution Concept (Current Implementation)

Last updated: 2026-02-10

## 1. Purpose
Self-evolution turns runtime failures into reusable skills without restarting the agent.
The goal is to improve robustness of action execution and planning, not to bypass safety controls.

## 2. Main components
- `src/agent/core/EvolutionEngine.js`
- `src/agent/core/CodeSandbox.js`
- `src/skills/SkillLibrary.js`
- `src/agent/core/ToolRegistry.js`
- `src/brain/UnifiedBrain.js` (code generation backend)

## 3. Evolution loop

1. Failure capture
- `TaskScheduler` emits `task.failed`.
- `ToolRegistry`/skills can emit `skill.failed`.
- `EvolutionEngine` listens and captures a snapshot.

2. Snapshot build
Snapshot includes:
- task name
- normalized error message/hash
- health/food/position
- inventory summary
- nearby block context

3. Fix generation
- Evolution requests code from `UnifiedBrain.generateReflexCode(...)`.
- If unavailable, fallback uses prompter coding API.

4. Validation
- Candidate code is validated in sandbox constraints before deployment.

5. Deployment
- Skill is hot-swapped into `SkillLibrary`.
- Skill metadata is dynamically registered into `ToolRegistry`.
- Experience is logged to Cognee memory when available.

6. Reuse
- Error hash cache avoids regenerating the same fix repeatedly.
- Registered dynamic skills become callable by planner/tool execution path.

## 4. Interaction with Action API
The preferred hardening path is:
- keep primitive reliability in `ActionAPI` (`mine/craft/place/smelt` + retries)
- let evolution generate higher-level wrappers or fallback procedures
- avoid replacing stable primitives with brittle generated code

This preserves strong "instinct" behavior while still allowing adaptation.

## 5. Interaction with memory
When memory is available:
- failures and successful fixes are persisted via `CogneeMemoryBridge.storeExperience(...)`
- subsequent planning can retrieve prior failures/solutions through recall

If Cognee service is unavailable:
- fallback vector store remains active
- evolution still runs, but long-term graph recall quality is reduced

## 6. Safety and limits
- Generated code must pass sandbox validation.
- Evolution does not execute arbitrary unsafe system operations.
- Recurrent system-level failures should trigger operator review, not blind auto-patching.

## 7. Practical production guidance
- Track frequent failure reasons from evolution stats.
- Promote repeatedly successful generated skills into reviewed static skills.
- Keep a blacklist policy for unstable generated skills.
- Prioritize deterministic ActionAPI improvements before adding more memory complexity.
