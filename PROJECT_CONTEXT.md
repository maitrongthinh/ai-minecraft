

# PROJECT CONTEXT & ARCHITECTURAL GUIDELINES (MINDCRAFT - AUTONOMOUS EVOLUTION EDITION)

> **MỤC ĐÍCH FILE NÀY:** File này chứa toàn bộ bối cảnh, kiến trúc và quy tắc cốt lõi của dự án Mindcraft Autonomous Evolution Agent. AI (Assistant) BẮT BUỘC phải đọc và tuân thủ các nguyên tắc này trước khi thực hiện bất kỳ thay đổi code nào để đảm bảo tính nhất quán và ổn định của hệ thống.

---

## 1. TỔNG QUAN DỰ ÁN (Project Overview)

**Mindcraft Autonomous Evolution Agent** là một hệ thống tự trị (Autonomous System) tiên tiến cho Minecraft, được thiết kế để:
- 🧠 **Học tập suốt đời** (Lifelong Learning) từ thành công và thất bại
- 🎯 **Sống sót độc lập** trong môi trường Minecraft tối thiểu 1 tháng
- ⚡ **Tự tối ưu hóa** code hành động sau nhiều lần thực thi
- 🏆 **Đạt 99% thành tựu Minecraft** một cách tự động
- 👤 **Giả dạng người chơi** trên SMP servers (future goal)

### Core Technologies:
* **Game Engine:** `mineflayer` (kết nối Minecraft), `mineflayer-pathfinder` (di chuyển)
* **AI Brain:** MiniMax-M2 (abab7) via MegaLLM.io cho strategic planning + Gemini Flash cho chat
* **Memory:** Cognee (Python-based Graph RAG) thay vì vector-only memory
* **Code Generation:** Self-evolving JavaScript skills với SmartCoder
* **Language:** Node.js (ES Modules - `import/export`) + Python 3.10+ (Cognee service)

### Mission Statement:
Bot không chỉ phản ứng với lệnh mà còn chủ động lập kế hoạch, tự phê phán rủi ro, tự học kỹ năng mới và tự tối ưu code cũ để ngày càng thông minh hơn.

---

## 2. KIẾN TRÚC HỆ THỐNG (System Architecture)

### 2.1. High-Level Architecture

```
┌─────────────────────────────── MINDCRAFT BOT ───────────────────────────────┐
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    STRATEGIC LAYER (New)                           │    │
│  │  - StrategyPlanner: Goal prioritization & long-term planning       │    │
│  │  - Self-Criticism: Risk assessment before dangerous actions        │    │
│  └──────────────────────────┬─────────────────────────────────────────┘    │
│                             │                                               │
│  ┌──────────────────────────▼─────────────────────────────────────────┐    │
│  │                 DUAL BRAIN (Enhanced)                              │    │
│  │  ┌─────────────────┐          ┌──────────────────┐                │    │
│  │  │  MiniMax-M2     │          │  Gemini Flash    │                │    │
│  │  │  (Tactical AI)  │          │  (Fast Chat)     │                │    │
│  │  │                 │          │                  │                │    │
│  │  │ • Planning      │          │ • Conversation   │                │    │
│  │  │ • Code Gen      │          │ • Simple tasks   │                │    │
│  │  │ • Strategy      │          │ • Fallback       │                │    │
│  │  └─────────────────┘          └──────────────────┘                │    │
│  │                                                                     │    │
│  │  Context Injection:                                                │    │
│  │  • Cognee Graph Memory (facts, locations, relationships)          │    │
│  │  • Skill Library Catalog (available actions)                      │    │
│  │  • World Metadata (world_id, game mode, objectives)               │    │
│  └────────────────────────┬────────────────────────────────────────────┘    │
│                           │                                                │
│  ┌────────────────────────▼────────────────────────────────────────────┐    │
│  │                 EXECUTION LAYER                                     │    │
│  │                                                                      │    │
│  │  ┌────────────────┐  ┌──────────────┐  ┌─────────────────────┐    │    │
│  │  │  SmartCoder    │  │ Skill        │  │  Reflexes (New)     │    │    │
│  │  │                │  │ Evolution    │  │                     │    │    │
│  │  │ • Generate code│  │              │  │ • DeathRecovery     │    │    │
│  │  │ • Self-debug   │  │ • Library    │  │ • Watchdog          │    │    │
│  │  │ • Save skills  │  │ • Optimizer  │  │ • Anti-stuck        │    │    │
│  │  └────────────────┘  └──────────────┘  └─────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                 MEMORY & KNOWLEDGE LAYER                             │    │
│  │                                                                       │    │
│  │  ┌───────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │    │
│  │  │  Cognee Graph     │  │  Skill Library  │  │  Minecraft Wiki  │  │    │
│  │  │  Memory (Python)  │  │  (File-based)   │  │  API (New)       │  │    │
│  │  │                   │  │                 │  │                  │  │    │
│  │  │ • World facts     │  │ • .js files     │  │ • Recipe lookup  │  │    │
│  │  │ • Locations       │  │ • Auto-optimize │  │ • Mob info       │  │    │
│  │  │ • Relationships   │  │ • Versioning    │  │ • Biome data     │  │    │
│  │  └───────────────────┘  └─────────────────┘  └──────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │              GAME INTERFACE (Existing - Mineflayer)                  │    │
│  │  • Movement, Combat, Building, Inventory management                  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Cấu trúc thư mục (Updated)

```
mindcraft/
├── main.js                  # Entry point + Environment validation
├── settings.js              # MODIFIED: Added MiniMax, Cognee, Watchdog configs
├── keys.example.json        # MODIFIED: Added MEGALLM_API_KEY
│
├── services/                # NEW: Python services
│   ├── memory_service.py    # Cognee FastAPI server
│   ├── requirements.txt     # Python dependencies
│   ├── setup.ps1            # Windows venv setup script
│   └── .cognee_data/        # Cognee graph database storage
│
├── src/
│   ├── agent/
│   │   ├── agent.js         # MODIFIED: World_id, Cognee integration, Reflexes
│   │   ├── SmartCoder.js    # MODIFIED: File-based skill storage
│   │   ├── StrategyPlanner.js  # NEW: Long-term planning and goal prioritization
│   │   └── reflexes/        # NEW: Automatic reaction systems
│   │       ├── DeathRecovery.js
│   │       └── Watchdog.js
│   │
│   ├── brain/
│   │   └── DualBrain.js     # MODIFIED: MiniMax routing, context injection
│   │
│   ├── memory/
│   │   ├── CogneeMemoryBridge.js  # NEW: Node.js → Python bridge
│   │   └── VectorStore.js   # Fallback when Cognee unavailable
│   │
│   ├── skills/
│   │   ├── SkillLibrary.js  # MODIFIED: File-based storage
│   │   ├── SkillOptimizer.js   # NEW: Auto-optimize after N uses
│   │   └── library/         # NEW: Individual skill files (.js)
│   │       ├── craft_potion.js
│   │       ├── mine_iron_safely.js
│   │       └── ...
│   │
│   ├── tools/
│   │   └── MinecraftWiki.js # NEW: Web scraping for recipes/info
│   │
│   └── prompts/
│       └── StrategicPrompts.js  # NEW: Self-criticism and strategic prompts
│
├── tests/                   # NEW: Testing infrastructure
│   └── integration/
│       ├── test_minimax.js
│       ├── test_cognee.js
│       └── test_skill_evolution.js
│
└── docs/
    ├── BRAINSTORM_BRIEF.md
    ├── implementation_plan.md
    ├── MINIMAX_SETUP.md     # NEW: MiniMax API setup guide
    └── MIGRATION_GUIDE.md   # NEW: Upgrading from old Mindcraft
```

### 2.3. Luồng dữ liệu (Data Flow) - UPDATED

#### Scenario 1: User gives command "Find and mine diamonds"

```
1. User chat → Agent.handleMessage()
2. Agent checks Cognee: "Do I know any diamond locations?"
3. Cognee returns: "Diamond vein at (-120, 12, 340)"
4. Agent injects context:
   {
     "memory": "I know diamond location at (-120, 12, 340)",
     "skills": ["mine_safely", "navigate_cave"],
     "current_state": { health: 95%, food: 80%, has_iron_pickaxe: true }
   }
5. DualBrain.planWithCriticism():
   - MiniMax analyzes risks
   - Checks requirements (pickaxe durability, food stock)
   - Generates step-by-step plan
6. SmartCoder checks SkillLibrary for "mine_safely"
   - Found! Executes cached skill instead of generating new code
7. Bot executes → Success
8. SkillLibrary.markSuccess("mine_safely") → success_count++
9. If success_count == 10 → SkillOptimizer.optimize("mine_safely")
```

#### Scenario 2: Bot dies

```
1. bot.on('death') → DeathRecovery captures location & cause
2. Store to Cognee: "Died at (50, 64, -100) from zombie"
3. bot.on('spawn') → DeathRecovery auto-pathfinds back
4. Collect dropped items
5. Return to safe base
6. Next time bot plans to go there → Cognee recalls: "Be careful, zombies at (50, 64, -100)"
```

#### Scenario 3: Bot stuck for 3 minutes

```
1. Watchdog detects: position unchanged for 180 seconds
2. Emergency Protocol:
   - Try 1: Jump + random walk (30s)
   - Try 2: If has OP → `/tp @s ~ ~10 ~`
   - Try 3: bot.quit() → reconnect
3. Log stuck event to Cognee
4. StrategyPlanner learns to avoid that location
```

---

## 3. QUY TẮC CODE (Coding Standards & Constraints)

### 3.1. Quy tắc An toàn & Ổn định (CRITICAL - PRESERVED FROM OLD)

> [!CAUTION]
> **CÁC QUY TẮC NÀY KHÔNG ĐƯỢC THAY ĐỔI**

1. **KHÔNG BAO GIỜ DÙNG `process.exit()` TRONG `Agent`:**
   * `Agent` chạy trên cùng một process Node.js với `main.js`. Nếu một bot gọi `process.exit()`, **toàn bộ server và các bot khác sẽ chết**.
   * **Thay thế:** Nếu bot lỗi hoặc bị kick, hãy dùng cơ chế `reconnect` hoặc chỉ dừng hoạt động của bot đó (`this.bot.quit()`), không giết process cha.

2. **Xử lý Lệnh & Dịch thuật:**
   * **Logic Sai (Cũ):** Dịch toàn bộ tin nhắn → Kiểm tra lệnh. (Dẫn đến sai cú pháp lệnh).
   * **Logic Mới (BẮT BUỘC):** Kiểm tra xem tin nhắn có bắt đầu bằng `!` (lệnh) hay không **TRƯỚC KHI** dịch. Giữ nguyên cú pháp lệnh, chỉ dịch phần tham số nếu cần.

3. **Mineflayer & Async/Await:**
   * Luôn sử dụng `async/await` cho các hành động tương tác với game (đào, đặt block, di chuyển).
   * Phải `await bot.pathfinder.goto(goal)` và xử lý ngoại lệ (try/catch) nếu không tìm thấy đường.

### 3.2. Phong cách Code

* Sử dụng **ES Modules** (`import ... from ...`), không dùng `require`.
* Class `Agent` là trung tâm, mọi module phụ phải nhận instance của `Agent` thông qua constructor.
* Logging: Sử dụng `console.log` có kèm context: `[ComponentName]` và `world_id` nếu có.
  ```javascript
  console.log(`[DualBrain] [${this.world_id}] Routing to MiniMax for planning`);
  ```

### 3.3. Error Handling - NEW STANDARDS

**Tất cả external service calls phải có:**
1. Retry logic (max 3 attempts với exponential backoff)
2. Fallback mechanism
3. Comprehensive error logging

**Example:**
```javascript
async function callCognee(data) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(COGNEE_URL, { method: 'POST', body: JSON.stringify(data) });
      return await res.json();
    } catch (error) {
      console.error(`[Cognee] Attempt ${attempt} failed:`, error);
      if (attempt === 3) {
        console.warn('[Cognee] All retries failed, using fallback VectorStore');
        return fallbackToVectorStore(data);
      }
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}
```

---

## 4. CÁC TÍNH NĂNG NHẠY CẢM (Sensitive Features)

### 4.1. Module `SmartCoder` (!newAction)

* Đây là tính năng rủi ro nhất (Remote Code Execution).
* Code được sinh ra chạy trong sandbox (`lockdown.js`).
* **Tuyệt đối không** cho phép AI tự ý import các thư viện hệ thống (`fs`, `child_process`) trừ khi được whitelist cụ thể.
* **NEW:** Mọi skill sau khi tạo đều được lưu thành file `.js` để review sau này.

### 4.2. Cognee Memory Service

* **Critical Dependency:** Bot phụ thuộc vào Python service chạy trên `localhost:8001`.
* **Failure Mode:** Nếu service crash, bot fallback về `VectorStore` nhưng sẽ mất graph memory.
* **Security:** Service phải chỉ lắng nghe `localhost`, không expose ra internet.
* **Data Isolation:** Mỗi world có `world_id` riêng, memory không được leak giữa các worlds.

### 4.3. MiniMax API & Budget Management

* **Rate Limiting:** DualBrain đã có rate limiter (500 requests/12h by default).
* **Monitoring:** Cần theo dõi usage để tránh vượt budget.
* **Fallback:** Nếu budget hết, DualBrain fallback về Gemini Flash (fast model).

---

## 5. CHIẾN LƯỢC SINH TỒN (Survival Strategy) - NEW SECTION

### 5.1. Tư duy Phản biện (Self-Criticism)

Bot **BẮT BUỘC** chạy self-criticism trước các hành động nguy hiểm:
- Đánh boss (Wither, Ender Dragon)
- Khám phá hang động sâu
- PvP combat
- Xây dựng farm phức tạp

**Checklist:**
1. Mục tiêu là gì?
2. Rủi ro gì có thể xảy ra?
3. Đường thoát hiểm ở đâu?
4. Có đủ tài nguyên không? (health, food, tools)

### 5.2. Ngưỡng An toàn (Safety Thresholds)

```javascript
const SAFETY_THRESHOLDS = {
  MIN_HEALTH: 40,      // < 40% → retreat immediately
  MIN_FOOD: 30,        // < 30% → eat before action
  MIN_TOOL_DURABILITY: 10  // < 10 uses left → craft new tool
};
```

Nếu vượt ngưỡng, bot **tự động hủy mọi kế hoạch** và ưu tiên sinh tồn.

### 5.3. World Awareness

Bot phải luôn biết:
- `world_id` hiện tại
- Game mode (survival, creative, hardcore)
- Time of day (tránh di chuyển ban đêm khi yếu)
- Nearby threats (mobs, lava, cliffs)

Thông tin này được inject vào mọi MiniMax query.

---

## 6. HƯỚNG DẪN CẬP NHẬT (Instruction for AI)

Khi bạn (AI) được yêu cầu thêm tính năng hoặc sửa lỗi, hãy thực hiện theo quy trình:

1. **Đọc hiểu kiến trúc:** 
   - Tính năng này thuộc layer nào? (Strategic, Execution, Memory)
   - Cần modify components nào?
   - Có cần thêm external service không?

2. **Kiểm tra ảnh hưởng:** 
   - Liệu thay đổi này có làm chết process chính không?
   - Có làm hỏng luồng sự kiện của Mineflayer không?
   - Có ảnh hưởng đến world isolation không?

3. **Viết code:**
   - Không xóa các comment quan trọng.
   - Không thay đổi các biến cấu hình trong `settings.js` trừ khi người dùng yêu cầu.
   - Đảm bảo error handling (không để crash app).
   - Thêm logging với proper context.

4. **Test:**
   - Unit test nếu là logic phức tạp
   - Integration test cho service communication
   - Manual test cho game interactions

5. **Document:**
   - Update PROJECT_CONTEXT.md nếu thay đổi architecture
   - Update README.md nếu thay đổi setup process
   - Add inline comments cho logic phức tạp

---

## 7. DANH SÁCH CÁC VẤN ĐỀ ĐÃ BIẾT (Known Issues to Avoid)

* **Dependency Hell:** Tránh cài thêm package mới nếu không thực sự cần thiết. Dự án đang dùng nhiều bản vá (`patches/`) cho `mineflayer`. Việc update library bừa bãi sẽ làm hỏng các bản vá này.

* **Vision Processing:** Xử lý ảnh rất chậm. Không được để logic Vision chặn (block) luồng xử lý chính của bot (Main Loop).

* **Cognee Service Startup Time:** Cognee service mất ~5-10 giây để khởi động. `main.js` đã có pre-flight check để verify service sẵn sàng trước khi spawn bot.

* **Skill File Conflicts:** Nếu nhiều bots chạy đồng thời, có thể xảy ra race condition khi ghi skill files. Solution: Thêm file locking hoặc dùng unique filenames per bot.

* **World_ID Persistence:** Hiện tại `world_id` được generate mới mỗi lần connect. Cần implement persistence để bot nhận ra đây là world cũ hay mới.

---

## 8. TESTING & VALIDATION REQUIREMENTS - NEW

### 8.1. Pre-deployment Checklist

Trước khi deploy bot, phải verify:

- [ ] Cognee service running (`curl http://localhost:8001/health`)
- [ ] MiniMax API accessible (test với dummy request)
- [ ] `MEGALLM_API_KEY` trong `keys.json`
- [ ] Skills directory writable (`src/skills/library/`)
- [ ] Logs directory exists

### 8.2. Continuous Monitoring

Trong khi bot chạy, monitor:

- [ ] Memory service uptime (log mỗi 5 phút)
- [ ] MiniMax API usage (check rate limit status)
- [ ] Skill learning rate (bao nhiêu skills/hour)
- [ ] Death frequency và recovery success rate
- [ ] Watchdog false positive rate

---

## 9. FUTURE ROADMAP

### Phase 9: Human Player Emulation (Future)
- Natural chat patterns (typos, slang, delays)
- Realistic movement (không đi thẳng như bot)
- Social interactions (greetings, small talk)
- Sleep cycles (logout at night)

### Phase 10: Multi-Bot Coordination (Future)
- Shared Cognee memory across bots
- Role specialization (builder, miner, fighter)
- Resource trading
- Collaborative planning

---

## 10. EMERGENCY PROCEDURES

### If Bot Goes Rogue:
1. Send chat command: `/stop` (graceful shutdown)
2. If unresponsive: Kill process (`Ctrl+C` hoặc PM2 stop)
3. Check logs: `logs/bot_[name].log`
4. Review last skill executed: `src/skills/library/`

### If Cognee Service Crashes:
1. Bot auto-fallbacks to VectorStore
2. Restart service: `cd services && uvicorn memory_service:app --port 8001`
3. Check `.cognee_data/` for corruption
4. If corrupted: Delete và reinitialize (bot sẽ mất memory cũ)

### If Stuck in Infinite Loop:
1. Watchdog should auto-trigger after 180s
2. If Watchdog disabled: Manual intervention required
3. Send chat: `/interrupt` để cancel current task

---

**Cập nhật lần cuối:** 2026-02-05 (Autonomous Evolution Architecture)  
**Version:** 2.0 (Upgraded from basic LLM bot to Lifelong Learning System)
