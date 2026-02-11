# 📖 MindOS v2.5 User Guide: Sovereign Swarm

Welcome to the **Sovereign Swarm** update. This guide covers how to operate, coordinate, and evolve your agents in MindOS v2.5.

---

## 🐝 1. Managing the Swarm
In v2.5, MindOS agents are no longer solitary. They function as a distributed hive mind.

### Automatic Discovery
Agents auto-discover each other on the same server using the **Sigma P2P Protocol**. 
- **Heartbeats:** Agents broadcast their HP, Role, and Target every 2 seconds.
- **Shared Vision:** If Agent A sees a threat, Agent B is alerted via the `SignalBus` even if it's across the map.

### Dynamic Roles
The swarm automatically assigns roles based on health and equipment:
- **TANK:** High HP, heavy armor. Takes the front line.
- **DPS:** High damage weapons. Focuses on the shared target.
- **RETREATER:** Low HP (<30%). Moves to the back and looks for food/healing.

---

## ⚔️ 2. Warrior Reflexes & Combat
Combat has been upgraded for high-level PvP.

### High-Precision Hits
The bot now uses **Lag Compensation (Backtracking)**.
- **How it works:** It stores a 1-second history of all nearby entity positions.
- **Precision:** When attacking, it calculates the target's position relative to your ping, ensuring hits land even against "teleporting" or fast enemies.

### Human-Like Movement
To bypass anti-cheat, the bot's movement is no longer linear:
- **Bézier Curves:** Head rotations follow natural curves rather than snapping.
- **Perlin Jitter:** Subtle, randomized micro-movements mimic a human hand on a mouse.

---

## 🧬 3. Adversarial Learning (Self-Evolution)
The bot now learns from its failures autonomously.

### The Replay Buffer
Whenever an agent dies, it generates a **Death Replay Snapshot**.
- **Location:** `logs/replays/death_replay_[timestamp].json`
- **Content:** The last 30 seconds of activity at 20 ticks-per-second resolution.

### Retrospective Analysis
1. The **Evolution Engine** freezes the state upon death.
2. It sends the replay context to the LLM.
3. The LLM identifies the tactical failure (e.g., "Died to lava while trying to mine").
4. **SmartCoder** generates a fix and hot-swaps the skill into the bot's brain instantly.

---

## 🛠️ 4. Performance & Troubleshooting

### Pathfinding Offloading
Heavy pathfinding calculations are now moved to a **Worker Thread**. This prevents the bot from "freezing" while calculating long routes.

### Common Commands
- `!status`: Check the bot's health, task, and current swarm role.
- `!swarm`: List all active peers in the current mesh.
- `!reset`: Emergency reset of the cognitive stack.

---

*“The swarm is the future of survival.”*
