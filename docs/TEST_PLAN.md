# Test Plan: Mindcraft Autonomous Evolution Agent

**Version:** 2.0 (Single-Brain Architecture)
**Last Updated:** 2026-02-05

---

## Pre-Flight Checklist

Before testing, verify:

| Check | Command | Expected |
|-------|---------|----------|
| Node.js | `node --version` | v18+ |
| npm packages | `npm install` | No errors |
| Cognee service | `cd services && uvicorn memory_service:app --port 8001` | Running on :8001 |
| API key | Check `keys.json` for `MEGALLM_API_KEY` | Non-empty |
| logs/ directory | Auto-created on first run | Exists after startup |

---

## Unit Tests

```powershell
# Test ActionLogger
node -e "import('./src/utils/ActionLogger.js').then(m => { m.ActionLogger.log('TEST', 'test_event', {foo:'bar'}); m.ActionLogger.flush(); console.log('OK'); })"

# Test DualBrain import
node -e "import('./src/brain/DualBrain.js').then(() => console.log('DualBrain imports OK'))"

# Test Cognee Bridge
node src/memory/test_bridge.js

# Test MiniMax API
node tests/integration/test_minimax.js
```

---

## In-Game Debug Commands

Once bot is connected, use these commands in Minecraft chat:

| Command | Action | Expected Result |
|---------|--------|-----------------|
| `!debug status` | Show system status | Displays model, budget, memory status |
| `!debug budget` | Show API budget | `X/200 requests used` |
| `!debug memory query <text>` | Test Cognee recall | Returns relevant memories |
| `!debug skill list` | List loaded skills | Shows skill names + success counts |
| `!debug log on` | Enable verbose logging | `Verbose mode: ON` |
| `!debug log off` | Disable verbose logging | `Verbose mode: OFF` |
| `!debug watchdog on` | Enable watchdog | `Watchdog: ENABLED` |
| `!debug watchdog off` | Disable watchdog | `Watchdog: DISABLED` |

---

## Integration Test Scenarios

### Scenario 1: Basic Chat
1. Say "Hello" to bot
2. **Expected:** Bot responds using MiniMax-M2
3. **Verify:** Check `logs/YYYY-MM-DD.log` for `chat_request` entry

### Scenario 2: Memory Store/Recall
1. Say "Remember: my favorite color is blue"
2. Wait 5 seconds
3. Say "What is my favorite color?"
4. **Expected:** Bot recalls "blue"
5. **Verify:** Check logs for `memory_store` and `memory_recall` entries

### Scenario 3: Death Recovery
1. Kill bot (fall damage, mob, etc.)
2. **Expected:** Bot logs death to Cognee and attempts recovery
3. **Verify:** Check logs for `death_recorded` and `recovery_attempt` entries

### Scenario 4: Watchdog (Anti-Stuck)
1. Trap bot in 1x1 hole
2. Wait 3+ minutes
3. **Expected:** Bot triggers emergency protocol (jump + random walk)
4. **Verify:** Check logs for `stuck_detected` entry

### Scenario 5: Skill Learning
1. Give complex task: "Build a shelter"
2. **Expected:** Bot creates code, saves as skill
3. **Verify:** Check `src/skills/library/` for new `.js` file

---

## 24-Hour Survival Test Protocol

### Setup
1. Start local Minecraft server (or Aternos)
2. Start Cognee service
3. Start bot with all features enabled

### Objective
"Survive 24 hours and collect 10 diamonds"

### Monitoring Checklist (Every 4 hours)
- [ ] Bot is still connected
- [ ] Cognee service is running
- [ ] No API budget exhaustion
- [ ] Check logs for errors
- [ ] Verify skill learning events

### Success Criteria
- [ ] Bot survives 24 hours
- [ ] 10+ diamonds in inventory
- [ ] 3+ skills learned and saved
- [ ] 0 unrecoverable crashes
- [ ] Cognee has 50+ stored facts

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Budget exceeded" | 200 requests used | Wait 12 hours or get new API key |
| Cognee connection failed | Service not running | `cd services && uvicorn memory_service:app --port 8001` |
| Bot not responding | API key invalid | Check `keys.json` for correct `MEGALLM_API_KEY` |
| Skills not loading | Directory missing | Create `src/skills/library/` |
| Logs not created | Permission issue | Ensure `logs/` directory is writable |

---

## Log File Analysis

After testing, analyze logs:

```powershell
# Count events by category
Get-Content logs/2026-02-05.log | ConvertFrom-Json | Group-Object category | Select Name, Count

# Find errors
Get-Content logs/2026-02-05.log | Where-Object { $_ -match "ERROR" }

# View last 20 entries
Get-Content logs/2026-02-05.log | Select -Last 20
```
