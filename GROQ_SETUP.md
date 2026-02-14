# Groq Cloud API Integration Guide

## Overview

**Groq** is a cloud-based inference platform providing ultra-fast LLM inference. The Groq integration enables Mindcraft bots to use Groq's models and achieve response times in **milliseconds** (vs. seconds with other providers).

**Note:** Groq is NOT the same as Grok/XAI. Grok is X.AI's model; Groq is Groq Cloud API.

## What's Integrated

✅ **GroqCloudAPI** class (`src/models/groq.js`)
- Supports chat completions with `chat.completions.create()`
- Supports vision models with image analysis
- Automatic max_tokens → max_completion_tokens migration
- Full streaming support (when needed)

✅ **Groq Profile** (`profiles/groq.json`)
- Uses **Meta Llama 3.3-70B-Versatile** (best balance of speed + reasoning)
- Optimized parameters: temp=0.7 (creative), max_tokens=2048 (balanced)
- Code model uses lower temperature (0.3) for focused output
- All Minecraft survival modes enabled

✅ **Model Detection** (`src/models/_model_map.js`)
- Automatically routes models containing "groq" to Groq provider
- Examples: "meta/llama-3.3-70b-versatile", "groq/*"

✅ **Settings Updated** (`settings.js`)
- Groq profile listed in commented profiles for easy activation

## Setup Instructions

### 1. Get a Groq API Key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** section
4. Create a new API key
5. Copy the key (you'll need it in the next step)

### 2. Configure API Key

**Option A: keys.json (Recommended)**
```json
{
    "GROQCLOUD_API_KEY": "gsk_your_groq_api_key_here"
}
```

**Option B: Environment Variable**
```bash
# Windows PowerShell
$env:GROQCLOUD_API_KEY = "gsk_your_groq_api_key_here"

# macOS/Linux
export GROQCLOUD_API_KEY="gsk_your_groq_api_key_here"
```

### 3. Enable Groq Profile

In `settings.js`, uncomment the Groq profile line:

```javascript
"profiles": [
    "./andy.json",
    // "./profiles/gpt.json",
    // ... other profiles ...
    "./profiles/groq.json",  // ← Uncomment this
    // ... more profiles ...
]
```

Or create a new bot with the profile:
```bash
node main.js --profile "profiles/groq.json"
```

### 4. Run the Bot

```bash
node main.js
```

The Groq bot will:
1. Load the groq.json profile
2. Detect "meta/llama-3.3-70b-versatile" → route to Groq
3. Initialize GroqCloudAPI with your API key
4. Start responding with ultra-fast inference

## Available Models

Groq Cloud API provides access to multiple models. The profile uses **Llama 3.3-70B** by default, but you can override in `profiles/groq.json`:

| Model | Best For | Speed | Context |
|-------|----------|-------|---------|
| `meta/llama-3.3-70b-versatile` | General chat & code | ⚡⚡⚡ | 8K |
| `meta/llama-3.1-70b-versatile` | Code generation | ⚡⚡⚡ | 8K |
| `meta/llama-3.1-8b-instant` | Fast responses | ⚡⚡⚡⚡ | 8K |
| `mixtral-8x7b-32768` | Reasoning tasks | ⚡⚡⚡ | 32K |
| `gemma2-9b-it` | Lightweight | ⚡⚡⚡⚡ | 8K |

To use a different model, edit `profiles/groq.json`:

```json
{
    "model": {
        "api": "groq",
        "model": "meta/llama-3.1-8b-instant",  // Use smaller/faster model
        "params": {
            "temperature": 0.7,
            "max_completion_tokens": 2048
        }
    }
}
```

## Performance Characteristics

### Response Times (Approximate)

- **Chat completions**: 200-800ms (vs. 2-10s with OpenAI/Anthropic)
- **Code generation**: 500-2000ms (vs. 5-15s with others)
- **Vision requests**: 1-3s (image processing + inference)

### Rate Limits (Free Tier)

- 30 requests per minute
- Shared rate limits across all requests
- No daily quota limit

### Cost

Groq offers free community tier with usage limits. Check [groq.com/pricing](https://groq.com/pricing) for latest rates.

## Troubleshooting

### "Groq API key not found" Error

```
Error: GROQCLOUD_API_KEY is required for Groq API
```

**Solution**: Make sure your API key is set in `keys.json` or as an environment variable.

### "Model not found" Error

```
Error: The model 'typo/model-name' does not exist
```

**Solution**: Use one of the models listed above. Check available models at [groq.com/pricing](https://groq.com/pricing).

### "Rate limit exceeded" Error

```
Error: Rate limit exceeded. Please retry after 60 seconds.
```

**Solution**: Your bot exceeded 30 requests/minute. Spread out requests or use a higher rate limit tier.

### Bot Responses are Slow

- Verify your internet connection (Groq API is cloud-based)
- Check if you're hitting rate limits
- Try a smaller model like `gemma2-9b-it`

### Vision Not Working

Some Groq models don't support vision. The profile uses Llama 3.3-70B which does support it. If you get "content must be a string" error:

Try switching to: `meta/llama-3.1-70b-versatile`

## Multiple Groq Bots

You can create multiple profiles with different Groq models:

**profiles/groq-fast.json:**
```json
{
    "name": "GroqFast",
    "model": {
        "api": "groq",
        "model": "meta/llama-3.1-8b-instant"
    }
    // ... rest of config
}
```

**profiles/groq-reasoning.json:**
```json
{
    "name": "GroqReasoning",
    "model": {
        "api": "groq",
        "model": "mixtral-8x7b-32768"
    }
    // ... rest of config
}
```

Then in `settings.js`:
```javascript
"profiles": [
    "./profiles/groq-fast.json",
    "./profiles/groq-reasoning.json"
]
```

## Comparing with Other Providers

| Feature | Groq | OpenAI | Anthropic |
|---------|------|--------|-----------|
| **Speed** | ⚡⚡⚡⚡ | ⚡⚡ | ⚡⚡ |
| **Cost** | Free tier | $$ | $$$ |
| **Models** | 8+ | 10+ | 5+ |
| **Context** | Up to 32K | 128K+ | 200K+ |
| **Vision** | ✅ | ✅ | ✅ |
| **Reasoning** | Good | ✅ Deep Seek | Native |

**Use Groq when**: You want ultra-fast responses and don't need massive context windows.

**Use OpenAI when**: You want the best general-purpose models and can pay per token.

**Use Anthropic when**: You need extended context (200K tokens) or prefer Claude.

## Detection System

The `_model_map.js` automatically detects Groq models:

```javascript
// Any of these will route to Groq:
"model": "groq/meta-llama-3.3-70b"      // ✅ groq prefix
"model": "meta/llama-3.3-70b"           // ✅ includes 'groq' setting
"model": "anything-groq-related"        // ✅ contains 'groq'
```

The detection order:
1. Check for "groq/*" prefix → use groq
2. Check if model string contains "groq" → use groq
3. Check for other providers (gpt, claude, etc.)
4. Fall back to default provider

## Advanced: Custom Model Mapping

To map a custom model name to Groq, edit `_model_map.js`:

```javascript
// Line 67 in _model_map.js
else if (profile.model.includes('my-custom-model'))
    profile.api = 'groq';
```

Then in your profile:
```json
{
    "model": {
        "model": "my-custom-model",
        "params": { ... }
    }
}
```

## API Reference

### Basic Usage (Internal)

The GroqCloudAPI class is used internally. You shouldn't need to call it directly:

```javascript
const { GroqCloudAPI } = await import('./src/models/groq.js');

const groq = new GroqCloudAPI(
    'meta/llama-3.3-70b-versatile',
    null,  // no custom URL
    { temperature: 0.7, max_completion_tokens: 2048 }
);

const response = await groq.sendRequest(messagesTurns, systemPrompt);
```

### sendRequest(messages, systemMessage, stop_seq)

- **messages**: Array of {role, content} objects
- **systemMessage**: String system prompt
- **stop_seq**: Optional stop sequence string
- **Returns**: String response from model

### sendVisionRequest(messages, systemMessage, imageBuffer)

- **messages**: Message array
- **systemMessage**: System prompt
- **imageBuffer**: Buffer containing image data
- **Returns**: String response with image analysis

## File Structure

```
📦 mindcraft-develop
├── 📄 keys.json                  ← Add GROQCLOUD_API_KEY here
├── 📄 settings.js                 ← Uncomment groq profile
├── 📁 profiles/
│   └── 📄 groq.json               ← Groq bot profile
├── 📁 src/models/
│   ├── 📄 groq.js                 ← GroqCloudAPI implementation
│   └── 📄 _model_map.js           ← Model detection (includes groq)
└── 📄 test_groq_integration.js     ← Integration verification test
```

## Verification

To verify your Groq integration is working:

```bash
node test_groq_integration.js
```

Expected output:
```
✅ Module: groq.js exists
✅ Module: GroqCloudAPI can be imported
✅ Profile: groq.json exists
✅ Profile: groq.json is valid JSON with required fields
✅ Model Detection: Groq model strings are detected
✅ Config: keys.json includes GROQCLOUD_API_KEY
✅ Constructor: GroqCloudAPI instantiation works
✅ Settings: groq.json is listed in settings.js

RESULTS: 8 passed, 0 failed
✅ ALL TESTS PASSED! Groq integration is complete.
```

## Support & Documentation

- **Groq Website**: [groq.com](https://groq.com)
- **API Docs**: [console.groq.com/docs](https://console.groq.com/docs)
- **API Playground**: [console.groq.com/playground](https://console.groq.com/playground)
- **Community**: [Groq Discord](https://discord.gg/groq)

## Next Steps

1. ✅ Set GROQCLOUD_API_KEY in keys.json
2. ✅ Uncomment groq.json in settings.js
3. ✅ Run `node main.js` to start the Groq bot
4. ✅ Type `/help` to see available commands
5. ✅ Chat with your ultra-fast Groq bot!

---

**Happy mining with Groq! ⚡**
