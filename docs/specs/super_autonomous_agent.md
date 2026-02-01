# 🏗️ SPECIFICATION: Super Autonomous Agent (Dual-Brain Architecture)

**Date:** 2026-02-01
**Context:** Upgrade "Mindcraft" to a self-sufficient, optimizing agent with budget constraints.

---

## 1. PROJECT GOALS
*   **Autonomy:** Survive 30 days, 90% achievements, build farms.
*   **Budget Optimization:** Main Brain (High IQ) < 200 reqs/12h. Secondary Brain (Fast) is unlimited.
*   **Self-Correction:** specialized `SmartCoder` loop for fix-on-fail.
*   **Long-term Memory:** VectorDB + "DayDream" summarization.

## 2. ARCHITECTURE OVERVIEW

### 2.1. Dual-Brain System (`src/brain/DualBrain.js`)
A facade that routes prompts based on complexity.
*   **HighIQ_Model:** Critical planning, coding, error recovery.
*   **Fast_Model:** Chit-chat, routine status checks, basic summarization.

### 2.2. Event-Driven Core (`src/agent/agent.js`)
Refactor the main loop to be **Reactive** instead of **Proactive (Tick-based)**.
*   **Triggers:** 
    *   Goal Completion/Failure.
    *   Health < 30% (Emergency).
    *   Incoming Chat.
    *   Idle > 5 minutes (Trigger DayDream).
*   **Default State:** `HumanManager` (heuristic algorithms) takes control for movement/mining to save tokens.

### 2.3. Smart Coder (`src/agent/SmartCoder.js`)
Extends `Coder.js`.
*   **Loop:** Generate Code -> Sandbox Run -> Capture Error -> **Refine (HighIQ)** -> Retry (Max 3).
*   **SkillLibrary:** Successfully executed functions are saved to `skills/*.js` for reuse without generation.

### 2.4. Memory System (`src/human_core/MemorySystem.js`)
*   **VectorDB:** SQLite + `@xenova/transformers` (embeddings).
*   **DayDreamRoutine:** On sleep/idle, compress `history` -> `summary` -> store in VectorDB -> clear `history`.

### 2.5. Blueprint Library (`src/blueprints/`)
*   Loader for `.schematic` / JSON files.
*   Allows bot to "project" a blueprint into the world and use `builder` mode to fill it.

---

## 3. IMPLEMENTATION PLAN

### Phase 1: Core Architecture & Dual Brain
*   Create `src/brain/DualBrain.js`.
*   Refactor `src/agent/agent.js` to implement the Event-Driven Loop (removing constant polling).
*   Update `settings.js` for dual model config.

### Phase 2: Smart Coder & Refinement Loop
*   Implement `src/agent/SmartCoder.js`.
*   Create `src/skills/SkillLibrary.js`.
*   Test with a "Create a farm" task.

### Phase 3: Advanced Memory (VectorDB)
*   Setup SQLite & Embeddings.
*   Implement `DayDream` logic.
*   Integrate with `DualBrain` (Fast model for summarization).

### Phase 4: Blueprints & Survival Heuristics
*   Implement Blueprint loader.
*   Optimize `HumanManager` for resource gathering without LLM.

---

## 4. TECH STACK & LIBRARIES
*   **Database:** `sqlite3` + `vec-extension` (or pure JS cosine sim if simpler).
*   **Embeddings:** `@xenova/transformers` (local execution).
*   **Models:** OpenAI/Anthropic (HighIQ), Gemini Flash/Local (Fast).
