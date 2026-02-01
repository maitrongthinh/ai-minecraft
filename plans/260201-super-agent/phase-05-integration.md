# Phase 05: Integration & Long-Run Test
Status: ⬜ Pending
Dependencies: Phase 01, 02, 03, 04

## 🎯 Strategic Objective
The "Soul" of the machine. Integration of all systems into a cohesive lifecycle. The bot should survive, build, and learn without constant user input.

## 🏗️ Architectural Design

### 1. Behavior Priority System (The "Consciousness" Loop)
We need to arbitrate between conflicting signals:
1.  **Critical Instincts (HumanManager):** Health < 10 or Hunger < 6. -> **HIGHEST PRIORITY**. Overrides everything.
2.  **User Commands:** Explicit overrides (`!stop`, `!build`). -> **HIGH**.
3.  **Strategic Goals (NPCController/DualBrain):** "Build a village", "Get iron". -> **MEDIUM**.
4.  **Idle/Dreaming (Dreamer):** Maintenance. -> **LOW**.

### 2. Survival Mode (`!survival`)
A toggleable mode where the bot autonomously:
1.  Checks Inventory.
2.  If hungry/hurt -> Fix it (Instincts).
3.  If no tool -> Make tool (SmartCoder/Skill).
4.  If no house -> Build house (Blueprint).
5.  If night -> Sleep or Hide.

## 📋 Implementation Steps (Detailed)

### Step 1: The Arbiter (`src/agent/Arbiter.js`)
- [ ] Create `Arbiter` class to manage the main loop.
- [ ] Connect `HumanManager` (Instincts), `NPCController` (Goals), and `Dreamer` (Maintenance).
- [ ] Implement priority logic.

### Step 2: Survival Logic Integration
- [ ] Update `NPCController` to yield to `Arbiter` when instincts trigger.
- [ ] Ensure `SmartCoder` can be triggered by `NPCController` for missing items (e.g., "I need a pickaxe").

### Step 3: Long-Run Verification
- [ ] Create `verify_survival.js` (Simulation).
- [ ] Test the "Day in the Life" scenario:
    1.  Spawn.
    2.  Get Wood (Skill).
    3.  Make Planks (Crafting).
    4.  Build House (Blueprint).
    5.  Sleep (Instinct/Routine).

## 🧪 Verification Plan
- **The "Castaway" Test:** Drop the bot in a random world. It must survive 1 Minecraft day, keep hunger > 10, and build a shelter.
