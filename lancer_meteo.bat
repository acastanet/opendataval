@echo off
setlocal

cd /d "%~dp0"
title Relance - Meteo OpenDataVdA

set "APP_URL=http://localhost:8080/meteo/essentiel/"

if not exist ".env" (
    if exist ".env.example" (
        echo Aucun fichier .env trouve, copie de .env.example vers .env...
        copy /y ".env.example" ".env" >nul
    ) else (
        echo ERREUR : aucun fichier .env ou .env.example n'est disponible.
        goto :erreur
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
        echo ERREUR : Docker Compose n'a pas ete trouve.
        echo Installe et demarre Docker Desktop, puis relance ce fichier.
        goto :erreur
    )
)

echo.
echo [1/3] Arret complet de la stack OpenDataVdA...
%COMPOSE_CMD% down --remove-orphans
if errorlevel 1 goto :erreur

echo.
echo [2/3] Reconstruction et redemarrage de la meteo et de ses services...
%COMPOSE_CMD% up -d --build
if errorlevel 1 goto :erreur

echo.
echo [3/3] Attente de la disponibilite de %APP_URL% ...
for /L %%I in (1,1,30) do (
    powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%APP_URL%'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
    if not errorlevel 1 goto :pret
    timeout /t 2 /nobreak >nul
)

echo ERREUR : le site ne repond pas apres 60 secondes.
echo Consulte les journaux avec : %COMPOSE_CMD% logs --tail=100
goto :erreur

:pret
echo.
echo Application meteo prete : %APP_URL%
%COMPOSE_CMD% ps
start "" "%APP_URL%"
echo.
echo Les services continuent de fonctionner apres la fermeture de cette fenetre.
echo Pour tout arreter plus tard : %COMPOSE_CMD% down
echo.
pause
exit /b 0

:erreur
echo.
echo La relance de l'application meteo a echoue.
pause
exit /b 1
