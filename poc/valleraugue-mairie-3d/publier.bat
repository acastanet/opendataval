@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "POC_PUBLISH_SCRIPT=%~dp0poc.py"
set "POC_PUBLISH_PYTHON=%~dp0.venv\Scripts\python.exe"
set "POC_PUBLISH_CONFIG=%~dp0config\poc-200m.conf"
set "POC_PUBLISH_CONFIG_EXAMPLE=%~dp0config\poc-200m.conf.example"

echo.
echo === Publication du visualiseur 3D Valleraugue ===
echo.

if not exist "%POC_PUBLISH_PYTHON%" (
  echo ERREUR : environnement Python absent.
  echo Creez-le avec :
  echo   py -3.11 -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

if not exist "%POC_PUBLISH_CONFIG%" (
  if not exist "%POC_PUBLISH_CONFIG_EXAMPLE%" (
    echo ERREUR : configuration et exemple absents.
    exit /b 1
  )
  copy /y "%POC_PUBLISH_CONFIG_EXAMPLE%" "%POC_PUBLISH_CONFIG%" >nul
  echo Configuration creee : config\poc-200m.conf
)

echo Regeneration, controle et publication du visualiseur (poc.py publish)...
echo.
"%POC_PUBLISH_PYTHON%" "%POC_PUBLISH_SCRIPT%" --config "%POC_PUBLISH_CONFIG%" publish
set "POC_PUBLISH_EXIT=%ERRORLEVEL%"

if not "%POC_PUBLISH_EXIT%"=="0" (
  echo.
  echo ERREUR : la publication a echoue ^(code %POC_PUBLISH_EXIT%^). Rien n'a ete mis en ligne
  echo si le controle du manifeste ou la detection d'un visualiseur perime a interrompu l'etape.
  exit /b %POC_PUBLISH_EXIT%
)

echo.
echo Publication ecrite dans .\publication ( montee en lecture seule par Caddy ).
echo Aucun rebuild d'image n'est necessaire : redemarrer le service suffit.
echo   docker compose up -d caddy
echo Puis verifier http://localhost:8080/valleraugue-3d/
echo ( recette complete : docs\publication-visualiseur.md, section 7 )
echo.

exit /b 0
