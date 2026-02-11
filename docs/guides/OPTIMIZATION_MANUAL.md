# 🧠 MindOS Optimization Manual: Toward Phase 5

This manual details the technical strategies for evolving MindOS into a high-performance, neuro-symbolic agent.

## 1. Model Efficiency & Intelligence

### 1.1 Adaptive Context (Nén Ngữ Cảnh)
Instead of raw voxel data, summarize the environment before processing. 
- Use **Context Compression** techniques to remove redundant tokens.
- **Benefit:** 20x reduction in token usage; mitigation of "Lost in the middle" phenomenon.

### 1.2 ReAct Framework (Thought + Action)
All LLM prompts must follow the **Reasoning + Acting** pattern.
- **Loop:** Observe -> Think -> Act -> Correct.
- **Implementation:** Modify `CoderPrompt.js` to require a `thought` field before the `code` field.

### 1.3 Small Language Models (SLM)
Offload trivial tasks to local models (Llama-3-8B / Phi-3).
- **Sub-Agents:** Inventory management, social chat, trap classification.
- **Execution:** Use Ollama or vLLM to host local endpoints.

## 2. Machine Intuition vs. LLM Logic

### 2.1 Hard-coded Heuristics
LLMs should not calculate math. Use deterministic algorithms for:
- **A* Pathfinding:** `bot.pathfinder`
- **MLG Water:** Physics-based trajectory calculation.
- **Hit Selection:** Hitbox geometry and velocity math.

### 2.2 Predictive Execution
Use **Background Workers** to pre-calculate survival scenarios (e.g., escape routes) while the planner is idle.

## 3. Runtime Optimization

### 3.1 isolated-vm (Memory Hardening)
Replace insecure `eval()` or `vm` modules with `isolated-vm`.
- **Isolates:** Run each skill in a restricted V8 isolate with capped RAM (e.g., 128MB).
- **Garbage Collection:** Destroy isolates after execution to reclaim 100% of memory.

### 3.2 Transient Listeners
In `ReflexSystem.js`, ensure all event listeners are temporary.
- Use `.once()` or manual removal after tasks.
- Prevents "Zombies" from polluting the Event-Loop.

## 4. Knowledge Management (RAG Optimization)

### 4.1 Skill Deduplication
When saving new skills to the `SkillLibrary`, perform a **Cosine Similarity** check.
- If similarity > 85%, trigger a **Merge Plan**.
- LLM should refactor the two skills into one generic, reusable module.

---
*Reference: Strategic Audit 2026-02-11*
