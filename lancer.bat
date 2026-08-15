@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
title Lancement - OpenDataVdA (stack, services V2 et meteo V2)
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
        tasklist /v /fo csv /nh /fi "PID eq !METEO_V2_PID!" | findstr /i /c:"OpenDataVdA Meteo V2" >nul && taskkill /pid !METEO_V2_PID! /t /f >nul 2>nul
    )
    del /q "%METEO_V2_PID_FILE%" >nul 2>nul
)

echo Liberation du port 4322 pour Meteo V2...
rem Le PID ci-dessus cible uniquement la fenetre Meteo V2 lancee par ce script.
rem Aucun balayage global du port n'est execute : il pourrait arreter un processus non lie.

echo.
echo Construction des images Docker (cache pnpm partage, reprises automatiques en cas de coupure reseau)...
echo.
%COMPOSE_CMD% build
if errorlevel 1 (
    echo.
    echo ECHEC de la construction des images Docker ^(voir le detail ci-dessus, souvent un timeout npm/pnpm^).
    echo Astuce : relance simplement ce script, le cache pnpm deja telecharge sera reutilise.
    echo.
    pause
    exit /b 1
)

echo.
echo Relance de la stack OpenDataVdA et de ses microservices...
echo.
echo Adresses locales :
echo   - Portail OpenDataVdA       : http://localhost:8080/
echo   - Accueil des services V2   : http://localhost:8080/api/v2
echo   - Etat des services V2      : http://localhost:8080/api/v2/status
echo   - Cartographie              : http://localhost:8080/api/v2/map/styles/carte.json
echo   - Mini-app Incendies        : http://localhost:8080/incendies/
echo   - Mini-app Meteo            : http://localhost:8080/meteo/essentiel/
echo   - Mini-app Eau              : http://localhost:8080/eau/
echo   - Frontend Meteo V2         : http://localhost:4322/meteo-v2/
echo.
echo L'accueil des services V2 liste toutes les API et leurs adresses avec leur etat en direct.
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
    powershell -NoProfile -Command "$p = Start-Process cmd.exe -ArgumentList '/k', 'cd /d ""%~dp0"" && title OpenDataVdA Meteo V2 && set VITE_GATEWAY_PROXY_URL=http://localhost:8080 && pnpm --filter meteo-web dev' -PassThru; $p.Id | Set-Content -NoNewline '%METEO_V2_PID_FILE%'"
)

start "OpenDataVdA - ouverture navigateur" /min cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:8080/api/v2"

%COMPOSE_CMD% up

pause
