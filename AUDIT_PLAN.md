# 📋 Kế Hoạch Kiểm Tra Bot Toàn Diện (Modular Audit Breakdown)

Tài liệu này phân chia **toàn bộ** mã nguồn của MindOS v2.5 thành 9 nhóm chức năng để kiểm tra (audit). Mục tiêu là đảm bảo không bỏ sót bất kỳ file nào và mỗi mô-đun đều hoạt động đúng thiết kế.

> **Trạng thái:** ⬜ Chưa kiểm tra | 🚧 Đang kiểm tra | ✅ Đạt | ❌ Lỗi

---

## 1. Lõi Hệ Thống (Core Kernel)
**Vai trò:** Xương sống của bot. Quản lý khởi động, cấu hình, vòng lặp sự kiện chính (`SignalBus`) và quản lý tiến trình.

### 📂 Danh sách File
*   [ ] `main.js` (Điểm khởi chạy chính)
*   [ ] `settings.js` (Tải cấu hình)
*   [ ] `keys.json` (API Keys - **BẢO MẬT**)
*   [ ] `keys.example.json` (Mẫu API Keys)
*   [ ] `src/agent/agent.js` (Bộ điều khiển Agent trung tâm)
*   [ ] `src/agent/core/SignalBus.js` (Hệ thống sự kiện trung tâm - **CỰC KỲ QUAN TRỌNG**)
*   [ ] `src/agent/core/CoreSystem.js` (Logic cốt lõi hệ thống)
*   [ ] `src/agent/core/TaskScheduler.js` (Lập lịch tác vụ)
*   [ ] `src/agent/core/BotState.js` (Quản lý trạng thái bot)
*   [ ] `src/agent/core/CoreExtractor.js` (Trích xuất thông tin cốt lõi)
*   [ ] `src/agent/connection_handler.js` (Xử lý kết nối bot)
*   [ ] `src/agent/mindserver_proxy.js` (Proxy kết nối máy chủ tư duy)
*   [ ] `src/process/agent_process.js` (Tiến trình agent độc lập)
*   [ ] `src/process/init_agent.js` (Khởi tạo agent)
*   [ ] `src/process/start_safe.js` (Cơ chế khởi động an toàn)
*   [ ] `src/process/HealthMonitor.js` (Giám sát sức khỏe bot)
*   [ ] `src/mindcraft/mindcraft.js` (Wrapper Minecraft client)
*   [ ] `src/mindcraft/mcserver.js` (Server Minecraft ảo)
*   [ ] `src/mindcraft/mindserver.js` (Server tư duy)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Khởi động:** Chạy `npm start` không lỗi, không crash ngay lập tức.
2.  **Môi trường:** `settings.js` đọc đúng file `.env` và `keys.json`, báo lỗi rõ ràng nếu thiếu key.
3.  **Sự kiện:** `SignalBus` phải hoạt động trơn tru (emit/on), không bị nghẽn (deadlock) hay rò rỉ bộ nhớ (max listeners warning).
4.  **Kết nối:** Kết nối thành công vào server Minecraft (localhost hoặc server thật) và duy trì kết nối (keep-alive).

---

## 2. Giác Quan & Dữ Liệu (Perception)
**Vai trò:** Cách bot cảm nhận thế giới Minecraft (Hình ảnh, Chat, Thực thể) và lưu trữ trạng thái Game.

### 📂 Danh sách File
*   [ ] `src/agent/core/EnvironmentMonitor.js` (Theo dõi môi trường xung quanh)
*   [ ] `src/agent/vision/vision_interpreter.js` (Phân tích hình ảnh AI)
*   [ ] `src/agent/vision/camera.js` (Camera chụp ảnh)
*   [ ] `src/agent/vision/browser_viewer.js` (Trình xem web)
*   [ ] `src/agent/modes.js` (Cảm nhận chế độ hoạt động)
*   [ ] `src/agent/interaction/SocialEngine.js` (Động cơ tương tác xã hội - Cảm biến xã hội)
*   [ ] `src/agent/interaction/SocialProfile.js` (Hồ sơ tương tác)
*   [ ] `src/agent/library/world.js` (Dữ liệu thế giới)
*   [ ] `src/agent/library/full_state.js` (Trạng thái đầy đủ của bot)
*   [ ] `src/agent/library/index.js` (Chỉ mục thư viện)
*   [ ] `src/agent/library/lockdown.js` (Cơ chế khóa)
*   [ ] `src/agent/library/skill_library.js` (Thư viện kỹ năng - Dữ liệu)
*   [ ] `src/agent/library/skills.js` (File kỹ năng legacy/tổng hợp)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Nhận diện:** Bot phải "nhìn thấy" chính xác block (gỗ, đá) và thực thể (người, zombie) trong tầm nhìn.
2.  **Cập nhật:** Khi thế giới thay đổi (đặt block, đập block), dữ liệu trong `world.js` phải cập nhật theo thời gian thực.
3.  **Vision:** Nếu bật Vision, bot phải chụp ảnh và mô tả được cảnh vật trước mắt qua `vision_interpreter.js`.

---

## 3. Bộ Não & Tư Duy (Brain & Logic)
**Vai trò:** Xử lý thông tin, ra quyết định, lưu trữ ký ức và lập kế hoạch chiến lược.

### 📂 Danh sách File
*   [ ] `src/brain/UnifiedBrain.js` (Điểm tích hợp LLM chính - **QUAN TRỌNG**)
*   [ ] `src/agent/Arbiter.js` (Trọng tài phân luồng quyết định: Phản xạ vs Suy nghĩ)
*   [ ] `src/agent/Dreamer.js` (Cơ chế mơ/tưởng tượng)
*   [ ] `src/agent/memory_bank.js` (Ngân hàng ký ức file gốc)
*   [ ] `src/agent/memory/AgenticQueryGenerator.js` (Tạo truy vấn ký ức)
*   [ ] `src/agent/memory/MemorySystem.js` (Hệ thống ký ức)
*   [ ] `src/agent/core/ContextAssembler.js` (Lắp ráp ngữ cảnh cho prompt)
*   [ ] `src/agent/core/ContextManager.js` (Quản lý ngữ cảnh)
*   [ ] `src/agent/core/KnowledgeStore.js` (Kho tri thức)
*   [ ] `src/agent/core/ReplayBuffer.js` (Bộ đệm tua lại tình huống - cho RL)
*   [ ] `src/agent/core/AdventureLogger.js` (Ghi nhật ký phiêu lưu)
*   [ ] `src/agent/core/ChatInstructionLearner.js` (Học từ hướng dẫn chat)
*   [ ] `src/agent/core/BehaviorRuleEngine.js` (Động cơ quy tắc hành vi)
*   [ ] `src/agent/orchestration/PlannerAgent.js` (Agent lập kế hoạch - System 2)
*   [ ] `src/agent/orchestration/CriticAgent.js` (Agent phản biện)
*   [ ] `src/agent/orchestration/ExecutorAgent.js` (Agent thực thi)
*   [ ] `src/agent/orchestration/System2Loop.js` (Vòng lặp tư duy chậm)
*   [ ] `src/strategies/*.json` (Các file chiến thuật định sẵn: `survival`, `nether`, `end`)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Prompt:** Context gửi lên LLM phải đầy đủ (Inventory, Health, Location) nhưng không quá dài (tránh tràn Context Window).
2.  **Ký ức:** Bot phải nhớ được sự kiện quan trọng (ví dụ: "vừa bị zombie giết ở tọa độ X") và lưu vào `MemorySystem`.
3.  **Lập kế hoạch:** `PlannerAgent` phải đưa ra được chuỗi hành động hợp lý (ví dụ: muốn có gỗ -> tìm cây -> đi tới -> chặt).
4.  **Phản biện:** `CriticAgent` phải phát hiện được kế hoạch sai (ví dụ: chặt cây mà không có rìu -> cần chế rìu trước).

---

## 4. Hành Động & Kỹ Năng (Action & Skills)
**Vai trò:** Thực hiện hành vi cụ thể (Di chuyển, Chế tạo, Chiến đấu).

### 📂 Danh sách File
*   [ ] `src/agent/action_manager.js` (Quản lý hàng đợi hành động)
*   [ ] `src/agent/core/ActionAPI.js` (Định nghĩa hành động cơ bản)
*   [ ] `src/agent/core/MotorCortex.js` (Điều khiển vận động)
*   [ ] `src/agent/core/PathfindingWorker.js` (Worker tìm đường - A*)
*   [ ] `src/skills/SkillLibrary.js` (Quản lý thư viện kỹ năng)
*   [ ] `src/skills/SkillOptimizer.js` (Tối ưu hóa kỹ năng bằng LLM)
*   [ ] `src/skills/library/craft_items.js` (Kỹ năng: Chế tạo)
*   [ ] `src/skills/library/combat_skills.js` (Kỹ năng: Chiến đấu cơ bản)
*   [ ] `src/skills/library/gather_*.js` (Kỹ năng: Thu thập gỗ, tài nguyên)
*   [ ] `src/skills/library/mine_ores.js` (Kỹ năng: Đào khoáng sản)
*   [ ] `src/skills/library/place_blocks.js` (Kỹ năng: Đặt block)
*   [ ] `src/skills/library/smelt_items.js` (Kỹ năng: Nung đồ)
*   [ ] `src/skills/library/eat_food.js` (Kỹ năng: Ăn uống)
*   [ ] `src/skills/library/find_shelter.js` (Kỹ năng: Tìm nơi trú ẩn)
*   [ ] `src/skills/library/movement_skills.js` (Kỹ năng: Di chuyển)
*   [ ] `src/skills/library/social_skills.js` (Kỹ năng: Xã hội)
*   [ ] `src/agent/reflexes/CombatReflex.js` (Phản xạ chiến đấu - PvP/PvE)
*   [ ] `src/agent/reflexes/MovementTactics.js` (Chiến thuật di chuyển - Strafing/Kiting)
*   [ ] `src/agent/reflexes/SelfPreservationReflex.js` (Phản xạ tự bảo vệ - Totem/Eat)
*   [ ] `src/agent/reflexes/Watchdog.js` (Chó canh gác - Phát hiện kẹt)
*   [ ] `src/agent/reflexes/HitSelector.js` (Chọn mục tiêu đánh)
*   [ ] `src/agent/reflexes/PhysicsPredictor.js` (Dự đoán vật lý - Projectile)
*   [ ] `src/agent/reflexes/FallDamageReflex.js` (Phản xạ rơi - MLG Water)
*   [ ] `src/agent/reflexes/DeathRecovery.js` (Hồi phục sau khi chết)
*   [ ] `src/agent/tasks/*.js` (Các nhiệm vụ phức tạp: Construction, Cooking)
*   [ ] `src/agent/npc/*.js` (Điều khiển NPC và mục tiêu xây dựng)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Thực thi:** Kỹ năng phải chạy được từ đầu đến cuối mà không bị treo (stuck).
2.  **Hồi phục:** Nếu kỹ năng thất bại (ví dụ: đang chặt cây thì rìu gãy), bot phải báo cáo thất bại để Brain xử lý lại.
3.  **Phản xạ:** Khi bị tấn công, `CombatReflex` phải kích hoạt ngay lập tức (<50ms) để đánh trả hoặc bỏ chạy.
4.  **Tìm đường:** Bot không được đi vào dung nham hoặc nhảy xuống vực thẳm.

---

## 5. Xã Hội (Social)
**Vai trò:** Giao tiếp với con người và các agent khác.

### 📂 Danh sách File
*   [ ] `src/agent/conversation.js` (Lịch sử và luồng trò chuyện)
*   [ ] `src/agent/speak.js` (Hàm nói chuyện ra chat game)
*   [ ] `src/agent/history.js` (Lịch sử hành động)
*   [ ] `src/agent/core/SwarmSync.js` (Đồng bộ bầy đàn - Swarm Intelligence)
*   [ ] `src/human_core/SocialProfile.js` (Hồ sơ xã hội - Cốt lõi)
*   [ ] `src/agent/core/PlayerTrainingMode.js` (Chế độ huấn luyện người chơi)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Hiểu lệnh:** Bot phải phân biệt được chat thông thường và lệnh (ví dụ: "bot, lại đây" vs "chào bạn").
2.  **Tính cách:** Phản hồi phải tự nhiên, đúng với tính cách được cài đặt trong Profile.
3.  **Đồng bộ:** Nếu có nhiều bot (Swarm), chúng phải chia sẻ thông tin vị trí và mục tiêu với nhau qua `SwarmSync`.

---

## 6. Tiến Hóa (Evolution)
**Vai trò:** Động cơ "SmartCoder" giúp bot tự viết code và nâng cấp bản thân.

### 📂 Danh sách File
*   [ ] `src/agent/coder.js` (Logic SmartCoder - AI viết code JS)
*   [ ] `src/agent/self_prompter.js` (Tự gợi ý prompt cho bản thân)
*   [ ] `src/agent/core/EvolutionEngine.js` (Động cơ tiến hóa)
*   [ ] `src/agent/core/CodeSandbox.js` (Môi trường chạy code an toàn - Isolation)
*   [ ] `src/agent/core/ReflexCreatorEngine.js` (Tạo phản xạ mới)
*   [ ] `src/agent/core/ToolCreatorEngine.js` (Tạo công cụ mới)
*   [ ] `src/agent/core/ToolRegistry.js` (Đăng ký công cụ mới)
*   [ ] `src/agent/core/AdvancementLadder.js` (Thang tiến bộ)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **An toàn:** Code AI viết BẮT BUỘC phải chạy trong Sandbox (`CodeSandbox.js`), không được truy cập file hệ thống của máy chủ.
2.  **Cú pháp:** SmartCoder phải sinh ra code Javascript hợp lệ, không lỗi cú pháp.
3.  **Rollback:** Nếu code mới gây lỗi, hệ thống phải tự động quay lại phiên bản cũ hoạt động tốt.

---

## 7. Công Cụ & Tiện Ích (Tools & Utils)
**Vai trò:** Thư viện hỗ trợ và kết nối Model AI.

### 📂 Danh sách File
*   [ ] `src/utils/mcdata.js` (Dữ liệu Minecraft: ID block, item)
*   [ ] `src/utils/text.js` (Xử lý văn bản)
*   [ ] `src/utils/math.js` (Toán học 3D, Vector)
*   [ ] `src/utils/keys.js` (Xử lý keys bảo mật)
*   [ ] `src/utils/ActionLogger.js` (Ghi lại hành động)
*   [ ] `src/tools/MinecraftWiki.js` (Tra cứu Wiki)
*   [ ] `src/models/*.js` (Tất cả file driver model: `gpt.js`, `gemini.js`, `ollama.js`, `claude.js`...)
*   [ ] `src/agent/commands/*.js` (Hệ thống lệnh nội bộ)

### ✅ Yêu Cầu Cần Đạt (Success Criteria)
1.  **Kết nối Model:** Các file trong `src/models/` phải gọi được API thành công và xử lý lỗi mạng.
2.  **Wiki:** Tool `MinecraftWiki` phải trả về thông tin công thức chế tạo chính xác khi được hỏi.

---

## 8. Tài Liệu (Documentation)
**Vai trò:** Hướng dẫn và ngữ cảnh dự án.

### 📂 Danh sách File
*   [ ] `README.md` (Hướng dẫn chính)
*   [ ] `PROJECT_CONTEXT.md` (Ngữ cảnh dự án - Quy tắc vàng)
*   [ ] `FAQ.md` (Câu hỏi thường gặp)
*   [ ] `CHANGELOG.md` (Nhật ký thay đổi)
*   [ ] `minecollab.md` (Tài liệu MineCollab)
*   [ ] `src/utils/## Basic Usage & Feature Guide.txt`

### ✅ Yêu Cầu Cần Đạt
1.  **Chính xác:** Thông tin trong tài liệu phải khớp với code hiện tại.
2.  **Cập nhật:** `PROJECT_CONTEXT.md` phải chứa các quy tắc mới nhất (Signal First, Sandbox Safety).

---

## 9. Khác (Other)
**Vai trò:** Cấu hình hệ thống, Docker, Git.

### 📂 Danh sách File
*   [ ] `package.json` & `package-lock.json`
*   [ ] `requirements.txt`
*   [ ] `Dockerfile` & `docker-compose.yml`
*   [ ] `.env` & `.env.example`
*   [ ] `eslint.config.js`
*   [ ] `bots/` (Dữ liệu bot runtime)

---

## 🚀 Hướng Dẫn Sử Dụng File Này
1.  **Copy** file này vào trình soạn thảo Markdown của bạn (Obsidian, VS Code...).
2.  **Đánh dấu [x]** vào các ô vuông khi bạn kiểm tra xong từng file.
3.  **Ghi chú** các lỗi tìm thấy ngay bên dưới tên file.

Chúc bạn Audit thành công! 🧠✨
