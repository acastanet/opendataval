@echo off
setlocal
cd /d "%~dp0"
python -B scripts\collect.py %*
if errorlevel 1 exit /b %errorlevel%
python -B scripts\rebuild.py
