# Qwen Reasoning API - Quick Reference

**✅ STATUS: ALL CONFIGURED & READY TO USE**

---

## 🚀 Three Tier System

| Profile | File | Effort | Speed | Best For |
|---------|------|--------|-------|----------|
| **Fast** | groq.json | low | ⚡ 1-2s | Chat, combat, instant decisions |
| **Balanced** | qwen.json | low | ⚡ 1-2s | General use, balanced performance |
| **Deep** | qwen-deep.json | high | 🧠 5-15s | Code, complex analysis, problems |

---

## ⚡ Quick Start (3 Steps)

### 1️⃣ Get API Key
```
Visit: https://dashscope.aliyun.com
Sign up → API Keys → Copy key
```

### 2️⃣ Add to keys.json
```json
{
    "QWEN_API_KEY": "sk_your_key_here"
}
```

### 3️⃣ Enable in settings.js (pick ONE)
```javascript
// For fast responses:
"./profiles/groq.json",

// OR for balanced:
"./profiles/qwen.json",

// OR for deep reasoning:
"./profiles/qwen-deep.json",
```

### 4️⃣ Run Bot
```bash
node main.js
```

---

## 📊 Reasoning Effort Levels

```
Effort: low
├─ Minimal thinking
├─ Fast responses (1-2s)
└─ Use for: chat, combat, decisions

Effort: medium (code only)
├─ Balanced reasoning
├─ Moderate speed (2-5s)
└─ Use for: code generation

Effort: high
├─ Deep reasoning
├─ Slow responses (5-15s)
└─ Use for: complex analysis
```

---

## 🎯 When to Use Each Profile

### Qwen Fast (groq.json) ⚡
**Best for**: Immediate responses needed
- Combat situations
- Movement commands
- General chat
- Time-sensitive decisions

### Qwen Balanced (qwen.json) ⚡
**Best for**: Default general use
- Standard gameplay
- Mining and gathering
- Regular interactions
- Good balance of speed/quality

### Qwen Deep (qwen-deep.json) 🧠
**Best for**: Complex problems
- Writing Minecraft code
- Debugging issues
- Strategic planning
- Complex recipes/builds

---

## 📝 Schema Overview

The bot now supports Qwen's Responses API schema:

**Input**:
- Messages (string or array)
- Reasoning effort (low/medium/high)
- Reasoning summary (auto/concise/detailed)

**Output**:
- JSON response with reasoning
- OR streaming event-stream response

---

## ✅ What's Installed

✓ `src/models/qwen.js` - Supports reasoning parameters  
✓ `profiles/groq.json` - Qwen Fast (low effort)  
✓ `profiles/qwen.json` - Qwen Balanced (low effort)  
✓ `profiles/qwen-deep.json` - Qwen Deep (high effort)  
✓ `settings.js` - All profiles listed  
✓ `keys.json` - QWEN_API_KEY ready  
✓ `test_qwen_reasoning.js` - 12 verification tests (all passing)  
✓ `QWEN_REASONING_SETUP.md` - Full documentation  

---

## 🧪 Verify Installation

```bash
node test_qwen_reasoning.js
# Should show: 12 passed, 0 failed ✅
```

---

## 🔥 Pro Tips

1. **Use Fast for chat, Deep for code**
   ```javascript
   "model": { "effort": "low" },    // Chat responses
   "code_model": { "effort": "high" } // Code analysis
   ```

2. **Monitor reasoning output in logs**
   ```
   [Reasoning: Analyzing situation... I see...]
   ```

3. **Adjust max_tokens for your needs**
   - Chat: 2048 tokens
   - Code: 4000-8000 tokens
   - Custom: Any value Qwen supports

4. **Switch profiles at runtime** by editing settings.js

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot won't start | Check QWEN_API_KEY in keys.json |
| No reasoning output | Verify "reasoning" field in profile |
| Slow responses | Use Qwen Fast instead of Deep |
| API key errors | Get key from dashscope.aliyun.com |
| JSON errors | Verify profile JSON is valid |

---

## 📚 Full Documentation

See `QWEN_REASONING_SETUP.md` for:
- Complete API schema details
- Performance benchmarks
- Advanced configuration
- Reasoning output examples
- Architecture diagrams

---

## 🎮 Example Bot Responses

### Qwen Fast (Low Effort)
**Input**: "Should I attack the creeper?"
**Speed**: 1-2 seconds
**Response**: "No, it's too close. Move back and place blocks for shelter first."

### Qwen Deep (High Effort)  
**Input**: "How do I optimize this furnace system?"
**Speed**: 5-10 seconds
**Response**: "[Reasoning: Analyzing fuel efficiency, item throughput... Multiple hoppers into one furnace creates bottlenecks...] Create a single hopper feeding into the furnace, with output routed to sorting bins..."

---

## 🔑 API Reference Quick Links

- **Qwen Dashscope**: https://dashscope.aliyun.com
- **Qwen Models**: https://dashscope.aliyuncs.com/models
- **API Docs**: https://help.aliyun.com/zh/dashscope
- **Pricing**: https://help.aliyun.com/zh/dashscope/product-overview/billing
- **Rate Limits**: Check in dashscope console

---

## ⚙️ Config File Locations

```
keys.json
├─ QWEN_API_KEY = "sk_..."

settings.js
├─ profiles: [
│  ├─ "./andy.json"
│  ├─ "./profiles/groq.json"      ← Qwen Fast
│  ├─ "./profiles/qwen.json"      ← Qwen Balanced
│  └─ "./profiles/qwen-deep.json" ← Qwen Deep
│  ]

profiles/
├─ groq.json         (Qwen Fast)
├─ qwen.json         (Qwen Balanced)  
└─ qwen-deep.json    (Qwen Deep)
```

---

**Ready to use! Set QWEN_API_KEY and choose a profile.** ⚡🧠

