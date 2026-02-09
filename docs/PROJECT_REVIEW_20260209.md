# 📊 BÁO CÁO DỰ ÁN: Mindcraft Autonomous Evolution Agent

## 🎯 App này làm gì?
Mindcraft (MindOS) là một "Thực thể AI" sống trong Minecraft. Không chỉ nghe lệnh như bot thường, nó có "não bộ" (Dual-Loop) để tự suy nghĩ, tự học kỹ năng mới (Evolution), và phản xạ với môi trường (Reflexes) như một sinh vật sống.

## 📁 Cấu trúc chính
```
e:\mindcraft-develop\mindcraft-develop
├── .brain/                 # Bộ nhớ dài hạn & Context làm việc
├── bots/                   # Logs & dữ liệu của từng bot
├── docs/                   # Tài liệu dự án (Architecture, Guides)
├── profiles/               # Cấu hình tính cách bot (Prompt templates)
├── src/                    # Source code chính
│   ├── agent/              # Logic cốt lõi của Agent (Brain, Reflexes)
│   ├── mindcraft/          # Giao tiếp với Minecraft Server
│   ├── skills/             # Thư viện kỹ năng (Actions)
│   └── utils/              # Các hàm tiện ích chung
├── main.js                 # Entry point để chạy bot
├── package.json            # Khai báo thư viện & scripts
└── settings.js             # Cấu hình chung (Host, Port, Models)
```

## 🛠️ Công nghệ sử dụng
| Thành phần | Công nghệ |
|------------|-----------|
| **Core** | Node.js (ES Modules) |
| **Minecraft Lib** | Mineflayer + Plugins (Pathfinder, PvP, Armor) |
| **AI Brain** | OpenAI / Anthropic / Local LLMs (qua SDK) |
| **Memory** | Vector Store (ChromaDB/Local) + JSON |
| **Architecture** | Event-Driven + Dual-Loop (System 1/2) |

## 🚀 Cách chạy
```bash
# 1. Cài đặt dependencies (lần đầu)
npm install

# 2. Cấu hình môi trường
# Copy .env.example -> .env và điền API Keys

# 3. Chạy Bot
node main.js
```

## 📍 Đang làm dở gì?
Dự án vừa **Hoàn thành đợt Refactor lớn (Unified Architecture)**:
- **Phase 7 (Cleanup)**: Đã xong. Codebase sạch sẽ.
- **Verification**: Đã pass tất cả test tự động.
- **Trạng thái**: Sẵn sàng cho **Manual Test** cuối cùng.

## 📝 Các file quan trọng cần biết
| File | Chức năng |
|------|-----------|
| `src/agent/agent.js` | Bộ não trung tâm, điều phối mọi hoạt động |
| `src/agent/core/CoreSystem.js` | Khởi tạo hệ thống & subsystems |
| `src/agent/reflexes/` | Các phản xạ sinh tồn (Reflexes) |
| `settings.js` | Chỉnh server IP, bot profile, switch models |
| `PROJECT_CONTEXT.md` | Tài liệu kiến trúc & quy tắc "bất di bất dịch" |

## ⚠️ Lưu ý khi tiếp nhận
- **Signal Bus First**: Mọi giao tiếp module phải qua `globalBus`. Hạn chế gọi hàm trực tiếp.
- **Reflex Priority**: Hệ thống phản xạ (System 1) luôn ưu tiên hơn kế hoạch (System 2).
- **Manual Test**: Bot cần được test thực tế trong game để đảm bảo behavior tự nhiên.
