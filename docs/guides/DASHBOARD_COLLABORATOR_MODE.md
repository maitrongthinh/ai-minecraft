# Dashboard, Adventure Log, Assist Mode

Last updated: 2026-02-10

## 1. Dashboard tabs

MindOS dashboard (`/`) now renders three per-agent tabs:

- `Chat`: live bot output (`bot-output`).
- `Thought Process`: planner/executor traces (`bot-thought` + `system2-trace`).
- `Adventure Log`: daily in-game journal entries (`adventure-log`), including screenshot links when available.

## 2. Adventure log behavior

- Runtime module: `src/agent/core/AdventureLogger.js`
- Trigger: each in-game sunrise (new Minecraft day)
- Outputs:
  - `bots/<agent>/adventure/adventure_log.md` (append-only full journal)
  - `bots/<agent>/adventure/day-<N>.md` (per-day snapshot)
  - optional copied screenshots in `bots/<agent>/adventure/*.jpg`
- UI relay:
  - agent emits `adventure-log`
  - MindServer broadcasts to dashboard clients

## 3. Assist / Collaborator settings

Configure in `settings.js` or dashboard settings:

- `collaboration_mode`: `survival | assist | collaborator`
- `owner_username`: optional owner name (recommended for production servers)
- `teammate_agents`: list of bot names for collaborator sync
- `obey_owner`: reject non-owner errands when owner is configured

## 4. Assist request examples

Examples understood by deterministic parser in `agent.js`:

- `Hey MindOS, lấy cho tao 64 gỗ sồi`
- `MindOS get me 32 cobblestone`
- `follow me`
- `come here`
- `mode assist` / `mode survival` / `mode collaborator`

When addressed in survival mode by owner, bot auto-switches to `assist`.

## 5. Local Llama profile (Ollama)

`profiles/llama.json` is configured for local Ollama:

- model: `ollama/llama3.1:8b`
- url: `http://127.0.0.1:11434`
- embedding: `ollama`

Use it by adding `./profiles/llama.json` to `settings.profiles`.
