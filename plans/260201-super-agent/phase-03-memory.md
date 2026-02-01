# Phase 03: Memory System (VectorDB + DayDream)
Status: ⬜ Pending
Dependencies: Phase 01

## 🎯 Strategic Objective
The "Hippocampus". Without this, the agent is an amnesiac. We need to compress GBs of logs into MBs of meaningful context.

## 🏗️ Architectural Design

### 1. Vector Database
*   **Technology:** `sqlite-vss` (if compatible) or raw Cosine Similarity in JS (simpler, sufficient for <10k memories).
*   **Schema:** `memories (id, text, embedding, timestamp, type, importance)`.

### 2. The "DayDream" Routine
*   **Trigger:** When `Agent` enters `SLEEP` state (night in game) or `IDLE` > 5 mins.
*   **Process:**
    1.  Fetch last session's chat/actions.
    2.  Send to **FastModel**: "Summarize the key events, coordinates, and relationships learn today."
    3.  Embed the summary.
    4.  Insert into DB.
    5.  **Prune:** Delete raw history to free RAM.

## 📋 Implementation Steps (Detailed)

### Step 1: The Vault (`src/memory/VectorStore.js`)
- [x] Implement `VectorStore` class.
    - `add(text, metadata)`
    - `search(query, k=5)`
- [x] Integrate embedding model (Xenova/all-MiniLM-L6-v2) - runs locally to save tokens!

### Step 2: Dreaming Logic (`src/agent/Dreamer.js`)
- [x] Create `Dreamer` class.
- [x] Implement `summarizeRecentHistory()` using `DualBrain.askFast()`.

### Step 3: Retrieval Augmented Generation (RAG)
- [x] Update `Prompter.js`:
    - Before prompting HighIQ, `VectorStore.search(current_context)`.
    - Inject relevant memories into System Prompt.

## 🧪 Verification Plan
1.  **The "Secret" Test:**
    - Tell bot: "My favorite color is #FF00FF."
    - Wait for "Dream" cycle (simulate sleep).
    - Restart bot (clear RAM).
    - Ask: "What is my favorite color?" -> Should retrieve from VectorDB.

---
Next Phase: [Blueprint & Heuristics](../plans/260201-super-agent/phase-04-blueprints.md)
