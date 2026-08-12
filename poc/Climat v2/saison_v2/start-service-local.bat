@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Lanceur local : reprend uniquement les paramètres Copernicus du .env racine.
rem La clé n'est ni affichée ni copiée dans ce dossier ; Docker reste autonome.
set "ROOT_ENV=%~dp0..\..\..\.env"
set "COPERNICUS_CDS_URL=https://cds.climate.copernicus.eu/api"

if not exist "%ROOT_ENV%" (
  echo ERREUR : fichier .env racine introuvable : %ROOT_ENV%
  echo Ajoutez COPERNICUS_CDS_KEY dans C:\DEV_ALX\OpenDataVdA\.env.
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_ENV%") do (
  if /I "%%A"=="COPERNICUS_CDS_KEY" set "COPERNICUS_CDS_KEY=%%B"
  if /I "%%A"=="COPERNICUS_CDS_URL" set "COPERNICUS_CDS_URL=%%B"
)

if not defined COPERNICUS_CDS_KEY (
  echo ERREUR : COPERNICUS_CDS_KEY n'est pas definie dans %ROOT_ENV%.
  exit /b 1
)

set "SEASONS_DATA_DIR=%~dp0.data"
if not exist "%SEASONS_DATA_DIR%" mkdir "%SEASONS_DATA_DIR%"

echo Serveur des saisons : http://127.0.0.1:8001
echo Documentation : http://127.0.0.1:8001/docs
python -m uvicorn service.main:app --host 127.0.0.1 --port 8001
