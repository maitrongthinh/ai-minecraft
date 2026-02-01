# Phase 04: Blueprint & Survival Heuristics
Status: ⬜ Pending
Dependencies: Phase 01

## 🎯 Strategic Objective
"Instincts". The bot shouldn't need to *think* (use tokens) to know how to chop wood or build a simple wall. We hard-code efficiency.

## 🏗️ Architectural Design

### 1. Blueprint System (`src/blueprints/`)
*   **Concept:** Standardized JSON format for structures.
*   **Action:** `buildSchematic(name)` - Uses `mineflayer-builder`.
*   **Library:** Pre-loaded with:
    - `simple_house`
    - `wheat_farm`
    - `safety_tower`

### 2. Heuristic Manager (`src/human_core/HumanManager.js`)
*   **Role:** The "Lizard Brain". Handles survival without AI.
*   **Behaviors:**
    - `findFood()`: Scans nearby blocks for food -> go to it.
    - `flee()`: Detects low health -> sprint away from nearest entity.
    - `sortInventory()`: Group items.

## 📋 Implementation Steps (Detailed)

### Step 1: Blueprint Loader
- [x] Create `BlueprintManager`.
- [x] Add `schematic` parser (or use existing library).

### Step 2: Survival Algorithms
- [x] Refactor `HumanManager` to expose standalone behaviors.
- [x] Hook into `DualBrain.askFast()` -> if request is "get food", redirect to `HumanManager.findFood()` instead of LLM. (Note: Handled by Instincts for now)

### Step 3: Integration
- [x] Add `!build <blueprint>` command.

## 🧪 Verification Plan
1.  **The "Starve" Test:** Set hunger to 19. Spawn food nearby. Bot should auto-eat without generating a single LLM token.
2.  **The "House" Test:** Command `!build simple_house`. Bot should replicate the JSON structure perfectly.

---
Next Phase: Integration
