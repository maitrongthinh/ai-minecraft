# 📊 BÁO CÁO DỰ ÁN: Mindcraft (Unified Architecture)
**Ngày:** 2026-02-09
**Phiên bản:** v2.2.0 (Verified)

## 🎯 App này làm gì?
Đây là một **AI Minecraft Bot** tự động hoàn toàn, có khả năng:
1.  **Tự sinh tồn**: Ăn, đánh quái, tránh lava (System 1 - Reflexes).
2.  **Tự suy nghĩ**: Lên kế hoạch, xây nhà, craft đồ phức tạp (System 2 - LLM Planner).
3.  **Học hỏi**: Lưu ký ức và kỹ năng mới vào database để dùng lại sau này.

---

## 📁 Cấu trúc chính (Verified)
| Folder | Chức năng | Trạng thái |
|--------|-----------|------------|
| `src/agent/core` | Hệ thống thần kinh (Scheduler, Context, SignalBus) | ✅ Stable |
| `src/agent/reflexes` | Phản xạ sinh tồn (System 1) | ✅ Optimized |
| `src/agent/intelligence` | Bộ não xử lý code (LLM CodeGen) | 🔒 Secured (Sandbox) |
| `src/skills` | Thư viện kỹ năng (Atomic Actions) | ✅ Organized |
| `src/memory` | Bộ nhớ dài hạn (Vector DB) | 🟡 Needs Tuning |
| `tests/` | Unit tests | ✅ Organized |

---

## 🛠️ Công nghệ sử dụng
| Thành phần | Công nghệ | Chi tiết |
|------------|-----------|----------|
| **Core** | Node.js | ES Modules |
| **Bot Framework** | IP: `mineflayer` | v4.33.0 |
| **AI Engine** | OpenAI / Anthropic / Gemini | Multi-model support |
| **Sandbox** | Node `vm` | Timeout: 5000ms |
| **Database** | (TBD - In `src/memory`) | `chromadb` (likely) |

---

## 📍 Trạng thái hiện tại
✅ **Đã hoàn thành Phase 8 (Hardening)**:
- **Security**: Đã đóng gói Code Engine vào `vm` sandbox để tránh code injection.
- **Stability**: Đã xử lý Race Condition bằng `AbortController`.
- **Optimization**: Context Manager đã biết lọc thông tin khi combat.

---

## 🏥 ĐÁNH GIÁ SỨC KHỎE CODE

### ✅ Điểm tốt
1.  **Kiến trúc Unified**: Tách biệt rõ ràng giữa Reflex (nhanh) và Planner (thông minh).
2.  **Code Safety**: Có cơ chế `SafeGuard` và `CodeSanitizer` + `VM Sandbox`.
3.  **No Dead Code**: Đã dọn dẹp sạch sẽ các file test cũ và module thừa (`modes.js`).

### ⚠️ Cần lưu ý (Monitor)
| Vấn đề | Mức độ | Gợi ý |
|--------|--------|-------|
| **Latency** | 🟡 Trung bình | Monitor độ trễ giữa System 1 và System 2 khi switching. |
| **Context Size** | 🟡 Trung bình | Quan sát token usage của `ContextManager` sau khi pruning. |
| **Test Coverage** | 🟢 Thấp | Cần viết thêm test cho `src/agent/reflexes`. |

---

## 🚀 Cách chạy
```bash
# 1. Cài đặt
npm install

# 2. Chạy Bot
node main.js

# 3. Chạy Test (Manual)
node tests/skills/test_skill_system.js
```

## 📝 Next Steps
- **User**: Chạy thử `node main.js` để kiểm tra thực tế.
- **Dev**: Cân nhắc thêm metrics dashboard (Prometheus/Grafana) ở Phase sau.
