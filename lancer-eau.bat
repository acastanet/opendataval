@echo off
cd /d "%~dp0"
title Lancement — L'eau a Valleraugue

echo Demarrage de l'API (Fastify :3000)...
start "API (Vigicrues / Hub'Eau)" cmd /k "pnpm dev:api"

echo Demarrage du site web (Astro :4321)...
start "Web (Astro)" cmd /k "pnpm dev:web"

echo Attente du demarrage des serveurs (API + site)...
timeout /t 12 /nobreak > nul

echo Ouverture de la mini app : http://localhost:4321/eau/
start "" "http://localhost:4321/eau/"

echo.
echo Fenetres ouvertes : API + Web. Fermez-les pour arreter les serveurs.
echo Appui sur une touche pour fermer ce lanceur (les serveurs continuent de tourner).
pause > nul
