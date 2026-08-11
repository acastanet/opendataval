@echo off
setlocal
cd /d "%~dp0"
python -B scripts\rebuild.py %*
