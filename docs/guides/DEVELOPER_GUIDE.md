# Developer Guide / Hướng Dẫn Phát Triển

## 👩‍💻 How to Create a New Skill / Cách Tạo Skill Mới

In MindOS, a "Skill" is a modular function that can be executed by the `ToolRegistry` or `ActionManager`.
Trong MindOS, "Skill" là một hàm module có thể được thực thi bởi `ToolRegistry` hoặc `ActionManager`.

### Step 1: Define the Skill / Định Nghĩa Skill
Create a file in `src/skills/` (e.g., `harvest_crops.js`).
Tạo file trong `src/skills/`.

```javascript
// src/skills/harvest_crops.js
export async function main(bot, params) {
    const { cropType } = params;
    // Logic here
    const block = bot.findBlock({ matching: cropType });
    if (block) {
        await bot.dig(block);
        return "Harvested " + cropType;
    }
    return "No crops found";
}
```

### Step 2: Register the Signal / Đăng Ký Tín Hiệu
If your skill listens to an event, register it in `CoreSystem.js` or via `SignalBus`.
Nếu skill lắng nghe sự kiện, đăng ký nó.

```javascript
globalBus.subscribe('CROP_READY', async (payload) => {
    // execute skill
});
```

---

## 🔧 Legacy Migration / Di Trú Code Cũ

If you have scripts from the old "ActionManager", follow these rules:
Nếu bạn có script từ "ActionManager" cũ, tuân thủ các quy tắc sau:

1.  **Do not call `bot.pathfinder.setGoal` directly.** Use `ActionManager.runAction('move', ...)` so it tracks the state. (Đừng gọi pathfinder trực tiếp. Hãy dùng ActionManager).
2.  **Use `await`**: All actions must be async. (Tất cả hành động phải async).
3.  **Emit Events**: If you write a complex action, emit `ACTION_STARTED/COMPLETED` so System 2 knows what you are doing. (Emit sự kiện để System 2 biết bạn đang làm gì).

---

## 🐞 Debugging / Gỡ Lỗi

MindOS produces structured logs.
MindOS tạo ra log có cấu trúc.

### Reading Logs / Đọc Log
Logs are stored in `logs/session_<timestamp>.jsonl`.
Log được lưu trong `logs/`.

```json
{"timestamp": 123456789, "level": "INFO", "module": "SignalBus", "message": "Signal THREAT_DETECTED emitted"}
```

### Visual Status / Trạng Thái Hình Ảnh
The bot uses head movement to indicate status:
Bot dùng chuyển động đầu để báo trạng thái:
- **Nodding (Gật đầu)**: Processing (System 2 ACTIVE). (Đang xử lý).
- **Shaking (Lắc đầu)**: Error / Failed. (Lỗi / Thất bại).
- **Looking Down (Nhìn xuống)**: Idle / Sleeping. (Nhàn rỗi).

---

## 🛡️ Sandbox Safety Rules / Quy Tắc An Toàn Sandbox

The `SmartCoder` executes code in a secure VM (Compartment).
`SmartCoder` chạy code trong VM an toàn.

1.  **NO `process.exit()`**: You cannot kill the process. (Không được diệt process).
2.  **NO `require()`**: You cannot import arbitrary/fs modules. Only whitelisted modules (`vec3`, `mineflayer-pathfinder`) are protected. (Không thể import tùy ý. Chỉ các module trong whitelist mới được dùng).
3.  **Async/Await**: The VM enforces timeouts. Infinite loops will be killed. (VM áp dụng timeout. Vòng lặp vô tận sẽ bị diệt).
