@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "POC_LAUNCH_SCRIPT=%~dp0poc.py"
set "POC_LAUNCH_PYTHON=%~dp0.venv\Scripts\python.exe"
set "POC_LAUNCH_CONFIG=%~dp0config\poc-200m.conf"

if not "%~1"=="" set "POC_LAUNCH_CONFIG=%~1"

if not exist "%POC_LAUNCH_PYTHON%" (
  echo ERREUR : environnement Python absent.
  echo Creez-le avec :
  echo   py -3.11 -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

if not exist "%POC_LAUNCH_CONFIG%" (
  echo ERREUR : configuration absente : %POC_LAUNCH_CONFIG%
  exit /b 1
)

rem La configuration passee ici ne designe pas la scene a assembler - le menu les liste
rem toutes - mais celle qui restera la scene par defaut du selecteur du visualiseur.
"%POC_LAUNCH_PYTHON%" "%POC_LAUNCH_SCRIPT%" --config "%POC_LAUNCH_CONFIG%" scenes
exit /b %ERRORLEVEL%
