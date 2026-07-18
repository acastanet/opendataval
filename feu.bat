@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
title Lancement - Risque incendie Aigoual et Cevennes

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
echo Demarrage de la mini-app Incendies et de ses services...
echo La page sera accessible sur http://localhost:8080/incendies/
echo Ctrl+C dans cette fenetre pour arreter les conteneurs.
echo.

start "OpenDataVdA Incendies - ouverture navigateur" /min cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:8080/incendies/"

%COMPOSE_CMD% up --build

pause
