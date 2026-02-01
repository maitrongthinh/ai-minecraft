# Phase 02: Smart Coder & Skill Library
Status: ⬜ Pending
Dependencies: Phase 01

## 🎯 Strategic Objective
Give the agent "Hands" that get better over time. Instead of hallucinating the same broken code 10 times, it must **Learn -> Refine -> Save**.

## 🏗️ Architectural Design

### 1. The Skill Library (`src/skills/SkillLibrary.js`)
*   **Storage:** JSON/File-based (initially) or SQLite.
*   **Structure:**
    ```json
    {
      "craft_iron_pickaxe": {
        "code": "async function(bot) { ... }",
        "description": "Crafts iron pickaxe with fallback to crafting table search",
        "success_rate": 0.9,
        "tags": ["crafting", "tool"]
      }
    }
    ```
*   **Logic:** Before asking AI to code, check `SkillLibrary` for semantic match.

### 2. The Smart Coder Loop (`src/agent/SmartCoder.js`)
*   **Standard Coder:** Generates -> Runs -> Forgets.
*   **Smart Coder:**
    1.  **Check Skill:** Exists? Run it.
    2.  **Generate:** If new, prompt HighIQ.
    3.  **Sandbox:** Run in `vm`.
    4.  **Catch Error:** If error, feed error stack back to HighIQ. "Fix this code."
    5.  **Verify:** If runs without error, Save to SkillLibrary.

## 📋 Implementation Steps (Detailed)

### Step 1: Skill Storage
- [x] Create `src/skills/` directory.
- [x] Implement `SkillManager` to load/save/search skills (using basic keyword match for now).

### Step 2: The Refinement Loop
- [x] Refactor `Coder.execute()` to return `success` status and `error` logs.
- [x] Implement `SmartCoder.generateCode()`:
    - **Loop (Max 3 retries):**
        - Prompt -> Code -> Execute.
        - If Fail -> Prompt(History + Error) -> New Code.
        - If Success -> `SkillManager.save()`.

### Step 3: Integration
- [x] Hook `!newAction` to use `SmartCoder`.

## 🧪 Verification Plan
1.  **The "Dirt Tower" Test:** Ask bot to "build a dirt tower 3 blocks high".
    - Force it to fail first (e.g., inject a syntax error).
    - Watch it self-correct.
    - Verify `build_dirt_tower.js` appears in `src/skills/`.
2.  **The "Recall" Test:** Ask it to build the tower again. It should *immediately* load the file, not prompt LLM.

---
Next Phase: [Memory System](../plans/260201-super-agent/phase-03-memory.md)
