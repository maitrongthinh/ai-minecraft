# MiniMax-M2 Setup Guide

## Overview

MiniMax-M2 (abab7) is a powerful reasoning model that serves as the "Tactical Brain" for strategic planning and code generation in the Mindcraft Autonomous Evolution system.

## Why MiniMax-M2?

- **Superior Reasoning**: Better than GPT-4o for long-term strategic planning
- **Cost-Effective**: More affordable than OpenAI's premium models
- **Full Control**: Self-hosted option available via MegaLLM

## Setup Instructions

### Option 1: Via MegaLLM.io (Recommended for Quick Start)

1. **Sign up for MegaLLM Account:**
   - Visit: https://ai.megallm.io
   - Create an account (free tier available)

2. **Get API Key:**
   - Go to Dashboard → API Keys
   - Create new API key
   - Copy the key (starts with `megallm_...`)

3. **Configure Mindcraft:**
   
   Create `keys.json` in project root (if not exists):
   ```json
   {
     "MEGALLM_API_KEY": "your_key_here"
   }
   ```

4. **Verify Connection:**
   
   Run test script:
   ```powershell
   node tests/integration/test_minimax.js
   ```
   
   Expected output:
   ```
   [MiniMax] Testing connection...
   [MiniMax] ✅ Connected successfully
   [MiniMax] Model: minimaxai/minimax-m2
   [MiniMax] Response time: <3s
   ```

### Option 2: Direct MiniMax API (Advanced)

If you prefer to use MiniMax directly without MegaLLM proxy:

1. **Get MiniMax API Key:**
   - Visit: https://api.minimax.chat
   - Register and get API key

2. **Configure in `settings.js`:**
   ```javascript
   "models": {
     "high_iq": {
       "provider": "minimax",
       "model": "abab7",
       "base_url": "https://api.minimax.chat/v1",
       "api_key_env": "MINIMAX_API_KEY"  // Will read from keys.json
     }
   }
   ```

## Configuration in settings.js

The bot is already configured to use MiniMax for strategic tasks:

```javascript
{
  "models": {
    "high_iq": {
      "provider": "minimax",
      "model": "minimaxai/minimax-m2",
      "base_url": "https://ai.megallm.io/v1",
      "rate_limit": 500  // requests per 12h
    },
    "fast": {
      "provider": "google",
      "model": "gemini-flash"  // For chat and simple tasks
    }
  }
}
```

## Usage

MiniMax is automatically used for:
- ✅ **Strategic Planning**: Long-term goal setting and risk assessment
- ✅ **Code Generation**: Writing new skills via `!newAction`
- ✅ **Self-Criticism**: Evaluating plans before dangerous actions
- ✅ **Skill Optimization**: Improving existing code after 10+ uses

Fast model (Gemini Flash) is used for:
- 💬 **Chat**: Casual conversation with players
- 🎯 **Simple Tasks**: Basic commands that don't need deep reasoning

## Pricing & Rate Limits

### MegaLLM Pricing (as of 2026):
- **Free Tier**: 100 requests/day
- **Pro Tier**: $20/month - 10,000 requests/month
- **Enterprise**: Custom pricing

### Recommended Settings:
```javascript
"rate_limit": 500  // Conservative limit for 24/7 bot operation
```

With this limit, bot can make ~40 requests/day, which is sufficient for:
- ~20 strategic planning sessions
- ~10 code generations
- ~10 skill optimizations

## Troubleshooting

### Error: "API key invalid"
✅ **Solution:** 
- Check `keys.json` for typos
- Ensure key starts with `megallm_`
- Verify key hasn't expired in dashboard

### Error: "Rate limit exceeded"
✅ **Solution:**
- DualBrain will automatically fallback to Gemini Flash
- Check usage in MegaLLM dashboard
- Consider upgrading to Pro tier if bot is very active

### Error: "Connection timeout"
✅ **Solution:**
- Check internet connection
- Verify MegaLLM service status: https://status.megallm.io
- Increase timeout in `settings.js`:
  ```javascript
  "request_timeout_seconds": 30
  ```

### Bot uses too many requests
✅ **Solution:**
- Reduce `rate_limit` in settings
- Enable skill caching (already enabled by default)
- Check logs for unnecessary planning calls

## Testing

Run the integration test to verify everything works:

```powershell
# Test MiniMax connection
node tests/integration/test_minimax.js

# Expected output:
# ✅ API connection successful
# ✅ Model response received
# ✅ Response time < 3s
# ✅ JSON parsing successful
```

## Advanced: Self-Hosted MiniMax

For maximum control and no API costs, you can run MiniMax locally:

1. **Requirements:**
   - GPU with 24GB+ VRAM (RTX 3090, A5000, or better)
   - 64GB+ RAM
   - 100GB+ disk space

2. **Setup:**
   ```powershell
   # Clone MiniMax repo
   git clone https://github.com/minimax-ai/minimax-server
   cd minimax-server
   
   # Download model weights
   python download_model.py --model abab7
   
   # Start server
   python server.py --port 8000
   ```

3. **Configure Mindcraft:**
   ```javascript
   "base_url": "http://localhost:8000/v1"
   ```

## Support

- **MegaLLM Support**: support@megallm.io
- **MiniMax Documentation**: https://docs.minimax.chat
- **Mindcraft Issues**: https://github.com/your-repo/issues

---

**Last Updated:** 2026-02-05  
**Mindcraft Version:** 2.0 (Autonomous Evolution)
