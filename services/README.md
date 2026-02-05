# Cognee Memory Service

Python-based graph memory service for Mindcraft Autonomous Evolution Agent.

## Overview

This service provides **Graph RAG (Retrieval-Augmented Generation)** memory for the Minecraft bot, enabling:
- 🧠 **Knowledge Graph Storage**: Facts stored as interconnected nodes (locations, events, relationships)
- 🔍 **Intelligent Recall**: Semantic search for relevant memories
- 🌍 **World Isolation**: Separate memory per Minecraft world via `world_id`
- 📈 **Lifetime Learning**: Bot remembers experiences across sessions

## Requirements

- **Python 3.10+** (3.11 recommended)
- **Windows** (Uses PowerShell setup script)
- **2GB+ RAM** (for Cognee embeddings)

## Quick Setup

### 1. Run Setup Script

```powershell
cd services
.\setup.ps1
```

This will:
- ✅ Check Python 3.10+ installed
- ✅ Create virtual environment (`venv/`)
- ✅ Install all dependencies
- ✅ Verify Cognee works

### 2. Test Cognee

```powershell
# Make sure venv is activated
.\venv\Scripts\Activate.ps1

# Run test
python test_cognee.py
```

**Expected output:**
```
[1/4] Initializing Cognee...
  ✓ Cognee initialized
[2/4] Adding facts to memory...
  ✓ Added fact 1: The bot found diamonds at coordinates...
  ...
✓ ALL TESTS PASSED
```

### 3. Create Memory Service (Task 3)

After tests pass, proceed to Task 3 to create `memory_service.py`.

## Manual Setup (Alternative)

If `setup.ps1` fails:

```powershell
# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\Activate.ps1

# Upgrade pip
python -m pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Test
python test_cognee.py
```

## Troubleshooting

### Error: "Python not found"
**Solution:**
1. Install Python 3.10+ from https://www.python.org/downloads/
2. Check "Add Python to PATH" during installation
3. Restart PowerShell
4. Verify: `python --version`

### Error: "cannot be loaded because running scripts is disabled"
**Solution:**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Error: "Cognee import failed"
**Solution:**
```powershell
.\venv\Scripts\Activate.ps1
pip install --upgrade cognee
python -c "import cognee; print(cognee.__version__)"
```

### Error: "ModuleNotFoundError: No module named 'cognee'"
**Solution:**
Make sure virtual environment is activated:
```powershell
# You should see (venv) in your prompt
.\venv\Scripts\Activate.ps1
```

## File Structure

```
services/
├── venv/                  # Virtual environment (created by setup.ps1)
├── requirements.txt       # Python dependencies
├── setup.ps1             # Windows setup script
├── test_cognee.py        # Test Cognee functionality
├── README.md             # This file
├── memory_service.py     # FastAPI service (Task 3)
└── .cognee_data/         # Cognee database (auto-created)
```

## Dependencies

See `requirements.txt` for full list. Main packages:

- **cognee** (0.1.20): Graph RAG library
- **fastapi** (0.109.0): Web framework
- **uvicorn** (0.27.0): ASGI server
- **python-dotenv** (1.0.0): Environment variables

## Next Steps

1. ✅ **Task 2**: Setup Python Environment ← YOU ARE HERE
2. ⬜ **Task 3**: Build Cognee Memory Service (FastAPI)
3. ⬜ **Task 4**: Create Node.js Bridge to Cognee
4. ⬜ **Task 5**: Integrate into DualBrain

## Support

- **Cognee Docs**: https://docs.cognee.ai
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Mindcraft Issues**: See PROJECT_CONTEXT.md

---

**Last Updated:** 2026-02-05  
**Mindcraft Version:** 2.0 (Autonomous Evolution)
