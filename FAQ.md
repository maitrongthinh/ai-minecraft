# ❓ Frequently Asked Questions (FAQ) & Troubleshooting
## Câu Hỏi Thường Gặp & Khắc Phục Sự Cố

> **Last Updated:** 2026-02-06
> **Support:** Submit an Issue on GitHub for help.

---

## 🚨 Critical / Lỗi Nghiêm Trọng

### 1. `Error: connect ECONNREFUSED 127.0.0.1:5000`
**Cause:** The bot cannot connect to the Minecraft client/server.
**Solution:**
1.  **Open LAN:** In your Minecraft game user interface, press Esc -> "Open to LAN" -> "Start LAN World".
2.  **Check Port:** The default port is `5000`. If Minecraft gives you a different port (e.g., `51234`), you must:
    *   Update `settings.js` (`port: 51234`) OR
    *   Run with environment variable: `$env:PORT=51234; node main.js`

### 2. `EADDRINUSE: address already in use :::8090`
**Cause:** The MindServer (Dashboard) is already running in another terminal, or a previous bot instance didn't close properly.
**Solution:**
1.  **Kill Zombie Processes:**
    ```powershell
    # Find the PID
    netstat -ano | findstr :8090
    # Kill it (replace 1234 with PID)
    taskkill /PID 1234 /F
    ```
2.  **Change Port:**
    Run the bot on a different port:
    ```powershell
    $env:MINDSERVER_PORT=8095; node main.js
    ```

### 3. `SyntaxError: Identifier 'high_iq' has already been declared`
**Cause:** Duplicate keys in your configuration files (`settings.js`).
**Solution:**
*   This was a known bug in early v1.0 builds. It has been fixed in the latest release.
*   **Fix:** Delete `node_modules` and run `npm install`. restore `src/agent/settings.js` to default.

---

## 🛠️ Configuration & Setup / Cấu Hình

### Q: How do I set API keys now? (Why is `keys.json` gone?)
**A:** We migrated to **Environment Variables** for better security.
1.  Rename `.env.example` to `.env`.
2.  Edit `.env` and paste your key: `OPENAI_API_KEY=sk-...`
3.  The bot auto-loads this file on startup.

### Q: Can I run this without an API Key?
**A:** **Technically Yes, Practically No.**
*   You *can* run the bot, but it will be "brain dead". It can follow basic reflexes (follow player, eat food) but cannot chat, plan, or build.
*   **Recommendation:** Use a local LLM (Ollama) if you want free usage. Update `profiles/andy.json` to point to `local/llama3`.

### Q: How do I enable "God Mode"?
**A:** Edit your profile (e.g., `andy.json`):
```json
"modes": {
    "god_mode": true,
    "creative": true
}
```
*Note: This strictly requires the bot to be OP on the server.*

---

## 🐛 Gameplay Issues / Vấn Đề Gameplay

### Q: The bot just stands there staring at me.
**A:** It might be in `Idle` mode or lacks a goal.
*   **Fix:** Chat with it! Say "Harvest some wood" to kickstart the planner.
*   **Check Logs:** Look at `logs/conversation.txt` to see if the AI is generating responses (or failing silently).

### Q: The bot attacks me! help!
**A:** You likely enabled `self_defense` and accidentally hit the bot.
*   **Fix:** Say "Stop!" or "Friend!". The bot's sentiment analysis should pick this up and reset hostility.
*   **Emergency:** Kill the bot process (`Ctrl+C`).

### Q: "Context length exceeded" errors.
**A:** The bot's short-term memory is too full.
*   **MindOS V1.0** includes a `ContextManager` that auto-summarizes history. If you see this, it means the summarizer is lagging.
*   **Fix:** Restart the bot to clear RAM context (Long-term memory persists in `.brain`).

---

## 💻 Development / Phát Triển

### Q: How do I add a new Skill manually?
1.  Create `src/skills/library/my_skill.js`.
2.  Use the standard JSDoc format (see `DEVELOPER_GUIDE.md`).
3.  Restart? **No need!** MindOS hot-reloads skills in `library/`.

### Q: I changed the code but nothing happened.
**A:** MindOS caches imported modules.
*   For `skills/`, it hot-reloads.
*   For `core/` (reflexes, agent.js), you **MUST** restart the node process.
