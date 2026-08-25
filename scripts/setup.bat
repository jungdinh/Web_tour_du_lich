@echo off
REM Tour Recommendation System - Quick Start Script (Windows)

echo ========================================
echo   Tour Recommendation AI - Setup
echo ========================================
echo.

REM Create root .env from example if not exists
if not exist .env (
    copy .env.example .env
    echo Created root .env file
)

REM Setup per-service .env files (already included in repo)
echo .env files already present in:
echo    - web-fe\.env
echo    - web-be\.env
echo    - ai-service\.env
echo    - crawler\.env
echo.
echo Make sure GEMINI_API_KEY is set in ai-service\.env (or leave empty for mock).
echo.

echo Installing dependencies...

REM web-fe
if exist web-fe (
    echo    Installing web-fe...
    cd web-fe
    call npm install
    if errorlevel 1 (
        echo    [WARN] npm install for web-fe failed. Continuing...
    )
    cd ..
)

REM web-be
if exist web-be (
    echo    Installing web-be...
    cd web-be
    call npm install
    if errorlevel 1 (
        echo    [WARN] npm install for web-be failed. Continuing...
    )
    cd ..
)

REM AI Service
if exist ai-service (
    echo    Installing ai-service...
    cd ai-service
    pip install -r requirements.txt
    if errorlevel 1 (
        echo    [WARN] pip install for ai-service failed. Continuing...
    )
    cd ..
)

REM Crawler
if exist crawler (
    echo    Installing crawler...
    cd crawler
    pip install -r requirements.txt
    if errorlevel 1 (
        echo    [WARN] pip install for crawler failed. Continuing...
    )
    cd ..
)

echo.
echo Dependencies installed!
echo.
echo ========================================
echo   Next Steps:
echo ========================================
echo.
echo 1. Make sure PostgreSQL is running.
echo    Create database if needed:
echo      createdb tour_recommendation
echo.
echo 2. Run migration:
echo    psql -U postgres -d tour_recommendation -f database\migrations\001_initial_schema.sql
echo.
echo 3. Generate sample data (optional, for demo):
echo    cd crawler ^&^& python scripts\generate_sample_data.py
echo.
echo 4. Start services in 3 separate terminals:
echo    Terminal 1: cd web-fe   ^&^& npm run dev
echo    Terminal 2: cd web-be   ^&^& npm run dev
echo    Terminal 3: cd ai-service ^&^& uvicorn app.main:app --reload --port 8000
echo.
echo ========================================
echo   Access Points:
echo ========================================
echo    Frontend:  http://localhost:5174
echo    Web API:   http://localhost:3000
echo    AI API:    http://localhost:8000
echo.
echo    Health checks:
echo      web-be:    GET  http://localhost:3000/health
echo      ai-service: GET  http://localhost:8000/health
echo.
pause
