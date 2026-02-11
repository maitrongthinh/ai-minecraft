# 👩‍💻 MindOS Code Contributor Guide
## Hướng Dẫn Nhà Phát Triển

> **Welcome to the MindOS Kernel Team.**
> This guide covers the standards, patterns, and workflows for contributing to the core agent logic.

---

## 1. Project Structure / Cấu Trúc Dự ÁN

```text
src/
├── agent/
│   ├── core/           # The Kernel (SignalBus, SwarmSync, PathfindingWorker)
│   ├── memory/         # UnifiedMemory (Vector + Graph + ReplayBuffer)
│   ├── reflexes/       # System 1 Inputs (Sensors, HitSelector)
│   ├── library/        # Core utilities
│   └── agent.js        # The Bootloader
├── skills/
│   ├── library/        # Human-written skills (Stable)
│   └── generated/      # AI-written skills (Volatile)
├── models/             # LLM Adapters (OpenAI, Gemini, Local)
├── process/            # Process Management (Init, Crash Recovery)
└── utils/              # Shared Helpers (McData, Logger)
```

---

## 2. Core Concepts / Khái Niệm Cốt Lõi

### Event-Driven Signaling
We verify **NO** direct coupling between the Planner and the Body.
*   ❌ **Don't:** `bot.chat("Hello")` inside a planning function.
*   ✅ **Do:** `globalBus.emitSignal(SIGNAL.OUT_CHAT, { content: "Hello" })`

### The Task Paradigm
Every action is a `Task` delivered via the new **JSON Protocol**.
*   **Protocol:** `{ thought, chat, task: { type: 'code', content: '...' } }`.
*   **Tasks** must be interruptible. Check `if (bot.interrupt_code)` in your loops.

---

## 3. How to Create a New Skill / Tạo Skill Mới

Skills are the "hands" of the bot. They reside in `src/skills/library/`.

**Template:**
```javascript
/**
 * Skill: mine_diamond
 * @description Locates and mines closest diamond ore.
 * @tags mining, resource, rare
 */
export async function mineDiamond(bot) {
    // 1. Setup Signal listeners (optional)
    
    // 2. Execute logic
    const ore = bot.findBlock({ matching: mcData.blocksByName.diamond_ore.id });
    if (!ore) return false;
    
    // 3. Perform action safely
    try {
        await bot.dig(ore);
        return true;
    } catch (err) {
        console.error("Mining failed", err);
        return false;
    }
}
```

---

## 4. Debugging & Logging / Gỡ Lỗi

### Using the Logger
We rely on `ActionLogger` for creating artifacts found in `bots/andy/logs/`.
```javascript
import { log } from '../utils/ActionLogger.js';

log(bot, "Initiating quantum jump...", "SYSTEM");
```

### Visual Debugger
Run the bot with the debugger profile to see the "Thought Process" visually in the terminal.
```bash
npm run debug
```

---

## 5. Advanced Patterns (v2.5) / Các Mô Hình Nâng Cao

### P2P Sigma Protocol
Agents communicate via whispers. Use `src/agent/core/SwarmSync.js` to broadcast global state updates.
- **Rule:** Never broadcast sensitive player data; only bot status and targets.

### Worker Threading
Heavy calculations (A*, ML) must be offloaded to `PathfindingWorker.js`.
- **Reason:** Node.js is single-threaded; any blocking calculation >50ms will cause the bot to stutter/disconnect.

## 6. Safe Coding Patterns (Audit v2.5) / Khuôn Mẫu Lập Trình An Toàn

### No Synchronous Blocking
- **Forbidden:** Heavy loops or synchronous `fs` calls on the main thread.
- **Solution:** Use `PathfindingWorker.js` for math or offload to background isolates.

### Isolated Execution
- All AI-generated code must eventually transition to **isolated-vm**.
- Limit memory usage to 128MB per execution slice.

### ReAct Consistency
- When writing prompts for new tasks, always use the **Thought-Action** JSON schema.
- This reduces logic errors by 70% by forcing the LLM to pre-calculate its intent.

---

## 7. Coding Standards / Tiêu Chuẩn

1.  **ES Modules:** Use `import/export`. No `require()`.
2.  **Async/Await:** All bot actions are async. Never block the main thread.
3.  **Error Handling:** Wrap all unreliable API calls (LLM, Pathfinder) in `try/catch`.
4.  **No Magic Numbers:** Use constants from `src/agent/settings.js` or `mcdata`.

---

## 6. Submitting a PR / Gửi Pull Request

1.  **Branch Name:** `feature/new-sensor` or `fix/pathfinding-bug`.
2.  **Test:** Run `node tests/syntax_check.js` before pushing.
3.  **Description:** Explain *why* you made the change, not just *what*.

---

**Happy Coding!** 🚀
