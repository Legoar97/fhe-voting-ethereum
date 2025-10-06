@echo off
chcp 65001 >nul
echo ======================================================
echo   SISTEMA DE VOTACIÓN PRIVADA CON FHE - EJECUCIÓN
echo ======================================================

echo [Paso 1/2] Generando votos cifrados con FHE...
python offchain\generate_votes.py
if errorlevel 1 (
    echo Error generando votos
    exit /b 1
)

echo.
echo Configuración (real generada):
powershell -NoProfile -Command ^
  "$m = Get-Content 'fhe_artifacts\\metadata.json' | ConvertFrom-Json; " ^
  "Write-Host ('  Total votantes: ' + $m.configuration.total_voters); " ^
  "Write-Host ('  Votos SI: ' + $m.configuration.yes_votes); " ^
  "Write-Host ('  Votos NO: ' + $m.configuration.no_votes); "
echo.

echo [Paso 2/2] Ejecutando simulación en blockchain...
call npx hardhat run scripts\run_voting_simulation.js
if errorlevel 1 (
    echo Error en simulación
    exit /b 1
)

echo.
echo Simulación completada exitosamente
echo.
