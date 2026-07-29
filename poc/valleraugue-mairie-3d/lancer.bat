@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "POC_LAUNCH_SCRIPT=%~dp0poc.py"
set "POC_LAUNCH_PYTHON=%~dp0.venv\Scripts\python.exe"
set "POC_LAUNCH_CONFIG=%~dp0config\poc-200m.conf"
set "POC_LAUNCH_CONFIG_EXAMPLE=%~dp0config\poc-200m.conf.example"
set "POC_LAUNCH_PORT=8000"

if not "%~1"=="" set "POC_LAUNCH_PORT=%~1"

echo.
echo === POC 3D Valleraugue ===
echo.

if not exist "%POC_LAUNCH_PYTHON%" (
  echo ERREUR : environnement Python absent.
  echo Creez-le avec :
  echo   py -3.11 -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

if not exist "%POC_LAUNCH_CONFIG%" (
  if not exist "%POC_LAUNCH_CONFIG_EXAMPLE%" (
    echo ERREUR : configuration et exemple absents.
    exit /b 1
  )
  copy /y "%POC_LAUNCH_CONFIG_EXAMPLE%" "%POC_LAUNCH_CONFIG%" >nul
  echo Configuration creee : config\poc-200m.conf
)

echo Verification de l'environnement et des donnees...
"%POC_LAUNCH_PYTHON%" "%POC_LAUNCH_SCRIPT%" --config "%POC_LAUNCH_CONFIG%" check
if errorlevel 1 (
  echo.
  echo ERREUR : la verification a echoue. Les anciennes instances sont conservees.
  exit /b 1
)

echo.
echo Arret des anciennes instances du visualiseur...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$port = 0; if (-not [int]::TryParse($env:POC_LAUNCH_PORT, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw ('Port invalide : ' + $env:POC_LAUNCH_PORT) };" ^
  "$script = [IO.Path]::GetFullPath($env:POC_LAUNCH_SCRIPT);" ^
  "$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue);" ^
  "$listenerPids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "$targets = @(Get-CimInstance Win32_Process | Where-Object { $cmd = [string]$_.CommandLine; $_.Name -match '^python(w)?\.exe$' -and (($cmd.IndexOf($script, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or (($listenerPids -contains [int]$_.ProcessId) -and $cmd -match '(?i)poc\.py.+\bserve\b')) });" ^
  "$targetPids = @($targets | Select-Object -ExpandProperty ProcessId);" ^
  "$foreignPids = @($listenerPids | Where-Object { $targetPids -notcontains $_ });" ^
  "if ($foreignPids.Count -gt 0) { throw ('Le port ' + $port + ' est utilise par un autre processus (PID ' + ($foreignPids -join ', ') + '). Aucun processus externe ne sera arrete.') };" ^
  "foreach ($target in $targets) { Write-Host ('Arret PID ' + $target.ProcessId); Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop }"

if errorlevel 1 (
  echo.
  echo ERREUR : impossible de liberer proprement le port %POC_LAUNCH_PORT%.
  exit /b 1
)

echo.
echo Lancement sur http://127.0.0.1:%POC_LAUNCH_PORT%/
echo Fermez avec Ctrl+C.
echo.

"%POC_LAUNCH_PYTHON%" "%POC_LAUNCH_SCRIPT%" --config "%POC_LAUNCH_CONFIG%" serve --port "%POC_LAUNCH_PORT%"
set "POC_LAUNCH_EXIT=%ERRORLEVEL%"

if not "%POC_LAUNCH_EXIT%"=="0" (
  echo.
  echo ERREUR : le visualiseur s'est arrete avec le code %POC_LAUNCH_EXIT%.
)

exit /b %POC_LAUNCH_EXIT%
