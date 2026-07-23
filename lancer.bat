@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
title Lancement - OpenDataVdA (stack + meteo V2)
set "METEO_V2_PID_FILE=%TEMP%\opendatavda-meteo-v2.pid"

if not exist ".env" (
    if exist ".env.example" (
        echo Aucun fichier .env trouve, copie de .env.example vers .env...
        copy /y ".env.example" ".env" >nul
    ) else (
        echo ATTENTION : ni .env ni .env.example ne sont presents. Poursuite avec les valeurs par defaut de docker-compose.yml.
    )
)

docker compose version >nul 2>nul
if not errorlevel 1 (
    set "COMPOSE_CMD=docker compose"
) else (
    where docker-compose >nul 2>nul
    if not errorlevel 1 (
        set "COMPOSE_CMD=docker-compose"
    ) else (
        echo.
        echo Docker n'a pas ete trouve ^(ni "docker compose" ni "docker-compose"^).
        echo Installe et lance Docker Desktop, puis relance ce script.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Arret de la stack OpenDataVdA existante...
echo Les volumes Docker et les donnees PostgreSQL sont conserves.
%COMPOSE_CMD% down --remove-orphans

if exist "%METEO_V2_PID_FILE%" (
    set /p "METEO_V2_PID="<"%METEO_V2_PID_FILE%"
    if defined METEO_V2_PID (
        taskkill /pid !METEO_V2_PID! /t /f >nul 2>nul
    )
    del /q "%METEO_V2_PID_FILE%" >nul 2>nul
)

echo Liberation du port 4322 pour Meteo V2...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4322 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo.
echo Relance de la stack OpenDataVdA et des microservices gateway, geography et weather...
echo.
echo Accueil : http://localhost:8080
echo Test Meteo V2 : http://localhost:4322/meteo-v2/
echo Mini-apps accessibles depuis la meme stack :
echo   - Incendies : http://localhost:8080/incendies/
echo   - Meteo     : http://localhost:8080/meteo/essentiel/
echo   - Eau       : http://localhost:8080/eau/
echo.
echo Le frontend Meteo V2 est lance dans une seconde fenetre et utilise le gateway via Caddy.
echo Ctrl+C dans cette fenetre arrete la stack Docker. La fenetre Meteo V2 sera fermee automatiquement a la prochaine relance.
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
    echo.
    echo pnpm n'a pas ete trouve. La stack Docker sera lancee, mais le test Meteo V2 ne pourra pas demarrer.
    echo Installe Node.js et pnpm 11.10.0, puis relance ce script.
    echo.
) else (
    powershell -NoProfile -Command "$p = Start-Process cmd.exe -ArgumentList '/k', 'cd /d ""%~dp0"" && set VITE_GATEWAY_PROXY_URL=http://localhost:8080 && pnpm --filter meteo-web dev' -PassThru; $p.Id | Set-Content -NoNewline '%METEO_V2_PID_FILE%'"
)

start "OpenDataVdA - ouverture navigateur" /min cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:4322/meteo-v2/"

%COMPOSE_CMD% up --build

pause
