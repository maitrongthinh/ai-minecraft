

# PROJECT CONTEXT & ARCHITECTURAL GUIDELINES (MINDCRAFT)

> **MỤC ĐÍCH FILE NÀY:** File này chứa toàn bộ bối cảnh, kiến trúc và quy tắc cốt lõi của dự án Mindcraft. AI (Assistant) BẮT BUỘC phải đọc và tuân thủ các nguyên tắc này trước khi thực hiện bất kỳ thay đổi code nào để đảm bảo tính nhất quán và ổn định của hệ thống.

## 1. TỔNG QUAN DỰ ÁN (Project Overview)

**Mindcraft** là một framework đa tác nhân (multi-agent) cho Minecraft sử dụng LLM (Large Language Models) để điều khiển hành vi.

* **Core Library:** `mineflayer` (kết nối Minecraft), `mineflayer-pathfinder` (di chuyển), `langchain` (hoặc tương đương để xử lý LLM).
* **Ngôn ngữ:** Node.js (ES Modules - `import/export`).
* **Mục tiêu:** Tạo ra các bot có khả năng tự chủ cao: tự trò chuyện, tự viết code (`!newAction`) để giải quyết vấn đề, nhìn môi trường (Vision), và phối hợp nhóm.

## 2. KIẾN TRÚC HỆ THỐNG (System Architecture)

### 2.1. Cấu trúc thư mục quan trọng

* `main.js`: Entry point. Khởi tạo `Mindcraft.init` và spawn các agent.
* `src/agent/agent.js`: **Class quan trọng nhất (`Agent`).** Quản lý vòng đời của một bot.
* `src/brain/DualBrain.js`: **Dual-Brain Router.** Quản lý phân luồng tác vụ giữa `HighIQ` (Planning/Coding) và `FastModel` (Chat/Simple Tasks) để tối ưu chi phí.
* `src/agent/SmartCoder.js`: Module `SmartCoder`. Mở rộng từ `Coder`, có khả năng **Tự Sửa Lỗi (Self-Refinement)** và lưu code thành công vào `SkillLibrary`.
* `src/skills/SkillLibrary.js`: Kho lưu trữ kỹ năng (code snippets) bền vững.
* `src/memory/VectorStore.js`: Kho lưu trữ trí nhớ dài hạn (Vector Database).
* `src/agent/Dreamer.js`: Quản lý quy trình "Mơ" (Tóm tắt & Lưu ký ức).
* `src/agent/action_manager.js`: Quản lý hàng đợi hành động.
* `src/models/prompter.js`: Quản lý giao tiếp LLM.
* `settings.js`: File cấu hình toàn cục.

### 2.2. Luồng dữ liệu (Data Flow)

1. **Input:** Sự kiện từ Minecraft (`chat`, `whisper`, `death`, `spawn`) -> `Agent` lắng nghe.
2. **Processing:**
* `DualBrain`: Quyết định dùng model nào dựa trên loại tác vụ (Chat vs Command).
* `Prompter` / `Brain`: Gửi context tới LLM.
* LLM phản hồi -> `Agent` phân tích.

3. **Action:**
* **Chat:** `FastModel` -> `bot.chat()`.
* **Planning/Coding:** `HighIQ` -> `SmartCoder` -> `Snippet Execution` (trong Sandbox) -> Lưu vào `SkillLibrary` nếu thành công.



## 3. QUY TẮC CODE (Coding Standards & Constraints)

### 3.1. Quy tắc An toàn & Ổn định (CRITICAL)

1. **KHÔNG BAO GIỜ DÙNG `process.exit()` TRONG `Agent`:**
* `Agent` chạy trên cùng một process Node.js với `main.js`. Nếu một bot gọi `process.exit()`, **toàn bộ server và các bot khác sẽ chết**.
* **Thay thế:** Nếu bot lỗi hoặc bị kick, hãy dùng cơ chế `reconnect` hoặc chỉ dừng hoạt động của bot đó (`this.bot.quit()`), không giết process cha.


2. **Xử lý Lệnh & Dịch thuật:**
* **Logic Sai (Cũ):** Dịch toàn bộ tin nhắn -> Kiểm tra lệnh. (Dẫn đến sai cú pháp lệnh).
* **Logic Mới (BẮT BUỘC):** Kiểm tra xem tin nhắn có bắt đầu bằng `!` (lệnh) hay không **TRƯỚC KHI** dịch. Giữ nguyên cú pháp lệnh, chỉ dịch phần tham số nếu cần.


3. **Mineflayer & Async/Await:**
* Luôn sử dụng `async/await` cho các hành động tương tác với game (đào, đặt block, di chuyển).
* Phải `await bot.pathfinder.goto(goal)` và xử lý ngoại lệ (try/catch) nếu không tìm thấy đường.



### 3.2. Phong cách Code

* Sử dụng **ES Modules** (`import ... from ...`), không dùng `require`.
* Class `Agent` là trung tâm, mọi module phụ (Coder, NPC, Memory) phải nhận instance của `Agent` thông qua constructor.
* Logging: Sử dụng `console.log` có kèm tên Bot để dễ debug (VD: `console.log(this.name, 'đang di chuyển...')`).

## 4. CÁC TÍNH NĂNG NHẠY CẢM (Sensitive Features)

### 4.1. Module `Coder` (!newAction)

* Đây là tính năng rủi ro nhất (Remote Code Execution).
* Khi sửa đổi `src/agent/coder.js`, phải đảm bảo code được sinh ra chạy trong `try/catch`.
* **Tuyệt đối không** cho phép AI tự ý import các thư viện hệ thống (`fs`, `child_process`) trừ khi được whitelist cụ thể.

### 4.2. Memory & Context

* Bot có bộ nhớ ngắn hạn (`settings.max_messages`).
* Khi thêm tính năng mới, hãy cân nhắc xem nó có làm tràn context window không. Nếu cần lưu trữ lâu dài, hãy dùng `src/agent/memory_bank.js`.

## 5. HƯỚNG DẪN CẬP NHẬT (Instruction for AI)

Khi bạn (AI) được yêu cầu thêm tính năng hoặc sửa lỗi, hãy thực hiện theo quy trình:

1. **Đọc hiểu:** Xác định code nằm ở module nào (`agent.js`, `coder.js`, hay `prompter.js`...).
2. **Kiểm tra ảnh hưởng:** Liệu thay đổi này có làm chết process chính không? Có làm hỏng luồng sự kiện của Mineflayer không?
3. **Viết code:**
* Không xóa các comment quan trọng.
* Không thay đổi các biến cấu hình trong `settings.js` trừ khi người dùng yêu cầu.
* Đảm bảo error handling (không để crash app).



## 6. DANH SÁCH CÁC VẤN ĐỀ ĐÃ BIẾT (Known Issues to Avoid)

* **Dependency Hell:** Tránh cài thêm package mới nếu không thực sự cần thiết. Dự án đang dùng nhiều bản vá (`patches/`) cho `mineflayer`. Việc update library bừa bãi sẽ làm hỏng các bản vá này.
* **Vision:** Xử lý ảnh rất chậm. Không được để logic Vision chặn (block) luồng xử lý chính của bot (Main Loop).

