@echo off
setlocal

set "ROOT=%~dp0"

call :validate
if errorlevel 1 exit /b 1

if /I "%~1"=="--check" (
  echo All required commands and project files are available.
  exit /b 0
)

echo Starting Vivu services...

start "Vivu - AI Service" cmd /k "cd /d ""%ROOT%ai-service"" && ""%PYTHON_EXE%"" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "Vivu - Backend" cmd /k "cd /d ""%ROOT%web-be"" && npm run dev"
start "Vivu - Frontend" cmd /k "cd /d ""%ROOT%web-fe"" && npm run dev"

echo.
echo Services are opening in separate windows:
echo   Frontend:   http://localhost:5174
echo   Backend:    http://localhost:3000
echo   AI service: http://localhost:8000
echo.
echo Close each service window or press Ctrl+C in it to stop that service.
exit /b 0

:validate
where npm >nul 2>&1
if errorlevel 1 (
  echo Error: npm was not found. Install Node.js and try again.
  exit /b 1
)

set "PYTHON_EXE="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Get-Command python -ErrorAction SilentlyContinue).Source"') do set "PYTHON_EXE=%%P"

if not defined PYTHON_EXE (
  where py >nul 2>&1
  if not errorlevel 1 set "PYTHON_EXE=py"
)

if not defined PYTHON_EXE (
  echo Error: neither python nor py was found. Install Python and try again.
  exit /b 1
)

if not exist "%ROOT%web-fe\package.json" (
  echo Error: web-fe\package.json was not found.
  exit /b 1
)

if not exist "%ROOT%web-be\package.json" (
  echo Error: web-be\package.json was not found.
  exit /b 1
)

if not exist "%ROOT%ai-service\app\main.py" (
  echo Error: ai-service\app\main.py was not found.
  exit /b 1
)

if not exist "%ROOT%web-fe\node_modules" (
  echo Error: frontend dependencies are missing. Run npm install in web-fe.
  exit /b 1
)

if not exist "%ROOT%web-be\node_modules" (
  echo Error: backend dependencies are missing. Run npm install in web-be.
  exit /b 1
)

"%PYTHON_EXE%" -c "import uvicorn" >nul 2>&1
if errorlevel 1 (
  echo Error: AI dependencies are missing. Run pip install -r ai-service\requirements.txt.
  exit /b 1
)

exit /b 0
