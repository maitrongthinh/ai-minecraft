# Phase 01: Core Architecture (DualBrain + EventLoop)
Status: ✅ Complete
Dependencies: None

## 🎯 Strategic Objective
We are building the **Central Nervous System**. If this fails, the whole agent is schizophrenic. The goal is to strictly separate *Reflexes* (Fast/Heuristic) from *Reasoning* (HighIQ).

## 🏗️ Architectural Design

### 1. DualBrain Manager (`src/brain/DualBrain.js`)
*   **Role:** Facade Pattern. Hides the complexity of multiple models.
*   **Logic:**
    *   `chat()` -> Fast Model (Context: ConversationHistory)
    *   `plan()` -> High IQ Model (Context: VectorDB + ShortTerm)
    *   `code()` -> High IQ Model (Strict JSON Mode)
*   **Fail-Over:** If HighIQ times out, fallback to Fast Model with a "Simple Plan" prompt.

### 2. Event-Driven Loop (`src/agent/agent.js`)
*   **Old Way:** `setInterval` -> Check everything -> maybe prompt LLM. (Wasteful)
*   **New Way:**
    *   `EventEmitter` triggers `onGoalFinished`, `onChat`, `onDamage`.
    *   **Idle State:** If no events for 10s -> `HumanManager` takes over (Look around, sort inventory, eat). *No Token Usage.*

## 📋 Implementation Steps (Detailed)

### Step 1: Brain Surgery (The Router)
- [ ] Create `src/brain/DualBrain.js`.
    - Define interfaces: `IVision`, `IChat`, `IPlanner`.
    - Implement Token Bucket Limiter (200 req/12h) for HighIQ.
    - **QC:** Unit test the router with mock API calls to ensure it switches models correctly.

### Step 2: Configure The Synapses (`settings.js`)
- [ ] Add strict strict config schema.
    - `models.high_iq`: { provider, model, rate_limit }
    - `models.fast`: { provider, model }

### Step 3: Transplant the Heart (`agent.js`)
- [ ] Refactor `Agent.update()`:
    - **Delete** the monolithic update loop.
    - **Insert** the State Machine: `IDLE` | `BUSY` | `SLEEP` | `EMERGENCY`.
    - **Hook** `DualBrain` into the `IDLE` -> `PLANNING` transition.
    - **QC:** Verify the bot stays `IDLE` and does NOT query LLM when nothing is happening.

## 🧪 Verification Plan
1.  **Mock Test:** Run `agent.js` with `DualBrain` mocked. Trigger 'chat' event. Verify `FastModel` is called.
2.  **Load Test:** Trigger 201 'planning' events. Verify the 201st switches to `FailSafe` or blocks (Rate Limiter check).
3.  **Visual Check:** Bot should spawn, look around (HumanManager), and stay silent until spoken to.

---
Next Phase: [Smart Coder](../plans/260201-super-agent/phase-02-smart-coder.md)
