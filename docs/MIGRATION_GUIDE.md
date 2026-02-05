# Migration Guide: Upgrading to Mindcraft Autonomous Evolution

This guide helps existing Mindcraft users upgrade to the new Autonomous Evolution architecture.

---

## What's New in v2.0?

1. **Dual-Brain AI** - MiniMax-M2 for planning + Gemini Flash for chat
2. **Graph Memory** - Cognee replaces basic vector memory
3. **Skill Evolution** - Self-optimizing code skills
4. **Reflexes** - Automatic death recovery and anti-stuck systems
5. **Strategic Planning** - Goal prioritization and self-criticism

---

## Upgrade Steps

### Step 1: Backup Your Data

```bash
# Backup profiles and memory
cp -r bots/ bots_backup/
cp keys.json keys_backup.json
```

### Step 2: Update keys.json

Add the new required API key:

```json
{
    "MEGALLM_API_KEY": "your-megallm-key-here",
    "COGNEE_SERVICE_URL": "http://localhost:8001"
}
```

Get your MegaLLM key at: https://ai.megallm.io

### Step 3: Install Python Dependencies

The Cognee memory service requires Python 3.10+:

```bash
cd services/
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt
```

### Step 4: Start Cognee Service (New!)

**Before running the bot**, start the memory service:

```bash
cd services/
uvicorn memory_service:app --host 0.0.0.0 --port 8001
```

Or use the provided script:
```bash
.\start_cognee.ps1
```

### Step 5: Update settings.js

Key changes to settings.js:

```javascript
// NEW: Dual-Brain Config
"models": {
    "high_iq": {
        "provider": "openai",
        "model": "gpt-5",
        "url": "https://ai.megallm.io/v1"
    },
    "fast": {
        "provider": "google",
        "model": "gemini-flash"
    }
},

// NEW: Cognee Service URL
"cognee_service_url": "http://localhost:8001",

// NEW: Watchdog Config
"watchdog": {
    "enabled": true,
    "stuck_timeout_seconds": 180,
    "check_interval_ms": 3000
}
```

### Step 6: Run the Bot

```bash
npm start
```

---

## Breaking Changes

| Old Behavior | New Behavior |
|--------------|--------------|
| Single LLM model | Dual-Brain (MiniMax + Gemini) |
| Vector-only memory | Graph Memory (Cognee) |
| Skills in code | Skills as .js files in `src/skills/library/` |
| Manual error recovery | Automatic DeathRecovery + Watchdog |

---

## Rollback

If you need to rollback:

1. Restore your backups
2. Stop Cognee service
3. Revert settings.js to old format
4. Run with your original configuration

---

## Troubleshooting

### Bot won't connect to MiniMax
- Check `MEGALLM_API_KEY` in keys.json
- Verify URL: https://ai.megallm.io/v1

### Cognee service fails to start
- Ensure Python 3.10+ is installed
- Check port 8001 is not in use
- Run `pip install -r requirements.txt` again

### Skills not loading
- Verify `src/skills/library/` directory exists
- Check file permissions
- Review skill file format (must have JSDoc header)

---

**Last Updated:** 2026-02-05
**Compatible:** Mindcraft v2.0 (Autonomous Evolution Edition)
