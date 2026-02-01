# Plan: Super Autonomous Agent (Strategic Master Plan)
Created: 2026-02-01
Status: 🟡 In Progress

## 🌍 The Big Picture (Architectural Vision)
We are transforming a reactive bot into a **proactive, budgeted survivalist**. The architecture must balance **Intelligence (HighIQ)** with **Efficiency (FastModel + Heuristics)**.

### critical Architectural Invariants
1.  **Budget First:** The system defaults to *Heuristic Mode*. LLM is a luxury resource triggered only by specific events.
2.  **Fail-Safe:** If the High IQ Brain enters a failure loop, the bot must fallback to a safe 'Hunker Down' state (build walls, hide) rather than crashing or burning tokens.
3.  **Data Consistency:** Memory (VectorDB) is the single source of truth for long-term context. It must not get corrupted by short-term hallucinations.

## Tech Stack
- **Runtime:** Node.js (Event Loop optimized)
- **Memory:** SQLite + Vector Extension (Local, fast, persistent)
- **Framework:** Mineflayer (Navigation/Interactions)
- **AI Layer:** Dual-Brain Router (OpenAI/Anthropic + Flash/Local)

## Detailed Phases

| Phase | Name | Focus | Status |
|-------|------|-------|--------|
| 01 | **Core Architecture (DualBrain + EventLoop)** | *Foundation* - The "Nervous System" | ✅ Complete |
| 02 | **Smart Coder & Skill Library** | *Adaptation* - The "Hands" that learn | ✅ Complete |
| 03 | **Memory System (VectorDB + DayDream)** | *Continuity* - The "Hippocampus" | ✅ Complete |
| 04 | **Blueprint & Survival Heuristics** | *Instinct* - Pre-trained knowledge | ✅ Complete |
| 05 | **Integration & Long-Run Test** | *Validation* - Survival Mode | ⬜ Pending |

## Execution Strategy ("Code tới đâu ngon tới đó")
- **Every Phase** ends with a specific verification script.
- **No Mocking**: We test with real loop cycles (even if dry-run).
- **Strict Typing**: Use JSDoc/Types to ensure `DualBrain` interface matches `Agent` expectations.

## Quick Commands
- Start Phase 1: `/code plans/260201-super-agent/phase-01-core-arch.md`
- Check progress: `/next`
