# MindOS: Sovereign Swarm (v2.5) - Bootstrap & Setup Guide

Chào mừng bạn đến với hệ thống MindOS. Đây là hướng dẫn chi tiết để bạn khởi động "bộ não" và "thân thể" của bot từ con số 0.

---

## 📋 1. Yêu cầu hệ thống (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt:
- **Node.js**: Phiên bản 18.x hoặc cao hơn.
- **Minecraft Server**: Phiên bản v1.21.x (Khuyên dùng Paper hoặc Fabric để tối ưu hiệu suất).
- **C++ Build Tools**: Cần thiết để biên dịch module `isolated-vm` (Nếu dùng Windows, hãy cài `npm install --global windows-build-tools` hoặc Visual Studio Build Tools).

---

## 🧠 2. Khởi động "Trí óc" (Neural Setup)

Bộ não của MindOS phụ thuộc vào các Large Language Models (LLM). Bạn cần cấu hình kết nối để bot có thể "suy nghĩ".

### Bước 2.1: Cấu hình Environment (.env)
1. Sao chép file mẫu: `cp .env.example .env`
2. Mở file `.env` và điền các API Key cần thiết:
   - **QUANGDZ_API_KEY**: Nếu dùng MiniMax-M2 qua MegaLLM (Khuyên dùng cho Evolution).
   - **OPENAI_API_KEY**: Nếu dùng GPT-4o.
   - **GEMINI_API_KEY**: Nếu dùng Google Gemini.

### Bước 2.2: Thiết lập Model (settings.js)
Mở file `settings.js` và kiểm tra phần `models`. Đảm bảo `apiKeyEnv` khớp với tên biến bạn đã đặt trong `.env`.
```javascript
"models": {
    "high_iq": {
        "api": "openai",
        "model": "minimaxai/minimax-m2",
        "url": "https://quangdz.exe.xyz/v1",
        "apiKeyEnv": "QUANGDZ_API_KEY"
    }
}
```

---

## 🤖 3. Khởi động "Thân thể" (Physical Setup)

Sau khi bộ não đã sẵn sàng, chúng ta sẽ kết nối bot vào thế giới Minecraft.

### Bước 3.1: Cài đặt Dependencies
Chạy lệnh sau tại thư mục gốc của project:
```bash
npm install
```
*Lưu ý: Nếu gặp lỗi với `isolated-vm`, hãy kiểm tra lại C++ Build Tools.*

### Bước 3.2: Cấu hình kết nối Server
Trong `settings.js`, điều chỉnh các thông số sau:
- `"host"`: IP của Minecraft Server (mặc định: `localhost`).
- `"port"`: Port của Server (mặc định: `25565`).
- `"auth"`: Chọn `"offline"` (cho server crack) hoặc `"microsoft"` (cho server premium).

### Bước 3.3: Launch Bot
Chạy lệnh để khởi động toàn bộ hệ thống:
```bash
node main.js
```
Hoặc nếu dùng npm script:
```bash
npm start
```

---

## 📊 4. Giám sát & Quản lý (Dashboard)

MindOS đi kèm với một Dashboard UI mạnh mẽ để bạn theo dõi suy nghĩ của bot.

1. **Truy cập**: Mở trình duyệt và vào địa chỉ `http://localhost:8092`.
2. **System 2 Thoughts**: Tại đây bạn sẽ thấy bot phân tích tình huống (Thought) trước khi thực hiện hành động (Code).
3. **Adventure Log**: Nếu bật `enable_adventure_log`, bot sẽ lưu lại hành trình hàng ngày dưới dạng Markdown.

---

## 🛡️ 5. Các tính năng nâng cao (Advanced Hardening)

Hệ thống v2.5 đã được tích hợp sẵn các cơ chế bảo vệ:
- **Isolated Sandbox**: Mọi code do AI tạo ra sẽ chạy trong sandbox 64MB để chống rò rỉ RAM.
- **Anti-Cheat Bypass**: Bot sử dụng Nonlinear Look (đường cong Bézier) để tránh bị phát hiện bởi Spartan/Grim.
- **Evolution Engine**: Bot tự học hỏi từ thất bại. Nếu hành động thất bại, nó sẽ tự viết lại code và lưu vào thư viện `src/skills/library`.

---

## 🆘 6. Xử lý sự cố (Troubleshooting)

- **Lỗi API Quota**: Kiểm tra số dư tài khoản LLM hoặc tăng `rate_limit` trong `settings.js`.
- **Bot không Look-At**: Đảm bảo server không cài đặt plugin giới hạn tốc độ xoay đầu quá gắt.
- **Lỗi Isolated-VM**: Đảm bảo node-gyp đã được cài đặt đúng cách.

---
*Chúc bạn có những trải nghiệm tuyệt vời cùng MindOS!*
