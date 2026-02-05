# Cognee Memory Service Setup (Windows PowerShell)
# This script sets up Python virtual environment and installs dependencies
# Run: .\setup.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cognee Memory Service Setup" -ForegroundColor Cyan
Write-Host "  Mindcraft Autonomous Evolution" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check Python version
Write-Host "[1/5] Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Found: $pythonVersion" -ForegroundColor Green
    
    # Extract version number
    if ($pythonVersion -match "Python (\d+)\.(\d+)") {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        
        if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
            Write-Host "  ✗ ERROR: Python 3.10+ required, found $major.$minor" -ForegroundColor Red
            Write-Host "`n  Please install Python 3.10 or higher from:" -ForegroundColor Yellow
            Write-Host "  https://www.python.org/downloads/" -ForegroundColor Cyan
            exit 1
        }
    }
} catch {
    Write-Host "  ✗ ERROR: Python not found" -ForegroundColor Red
    Write-Host "`n  Please install Python 3.10+ from:" -ForegroundColor Yellow
    Write-Host "  https://www.python.org/downloads/" -ForegroundColor Cyan
    exit 1
}

# Create virtual environment
Write-Host "`n[2/5] Creating virtual environment..." -ForegroundColor Yellow
if (Test-Path "venv") {
    Write-Host "  ⚠ Virtual environment already exists, skipping..." -ForegroundColor Yellow
} else {
    python -m venv venv
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Virtual environment created" -ForegroundColor Green
    } else {
        Write-Host "  ✗ ERROR: Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

# Activate virtual environment
Write-Host "`n[3/5] Activating virtual environment..." -ForegroundColor Yellow
try {
    & ".\venv\Scripts\Activate.ps1"
    Write-Host "  ✓ Virtual environment activated" -ForegroundColor Green
} catch {
    Write-Host "  ✗ ERROR: Failed to activate virtual environment" -ForegroundColor Red
    Write-Host "  You may need to run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

# Upgrade pip
Write-Host "`n[4/5] Upgrading pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ pip upgraded" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Warning: Failed to upgrade pip, continuing..." -ForegroundColor Yellow
}

# Install dependencies
Write-Host "`n[5/5] Installing dependencies from requirements.txt..." -ForegroundColor Yellow
Write-Host "  (This may take 2-3 minutes)" -ForegroundColor Gray

pip install -r requirements.txt

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ All dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ ERROR: Failed to install dependencies" -ForegroundColor Red
    Write-Host "`n  Try manually:" -ForegroundColor Yellow
    Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Cyan
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Cyan
    exit 1
}

# Test Cognee import
Write-Host "`n[TEST] Verifying Cognee installation..." -ForegroundColor Yellow
python -c "import cognee; print(f'  ✓ Cognee version: {cognee.__version__}')" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "" # Add newline after version
} else {
    Write-Host "  ✗ ERROR: Cognee import failed" -ForegroundColor Red
    exit 1
}

# Success message
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  ✓ SETUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test Cognee: python test_cognee.py" -ForegroundColor White
Write-Host "  2. Create memory service: (see Task 3)" -ForegroundColor White
Write-Host "  3. Start service: uvicorn memory_service:app --port 8001" -ForegroundColor White

Write-Host "`nTo activate venv in future sessions:" -ForegroundColor Gray
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Gray

Write-Host "`nDocumentation: See services/README.md`n" -ForegroundColor Gray
