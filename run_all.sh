#!/bin/bash

# Configurar encoding UTF-8
export LANG=en_US.UTF-8

echo "======================================================"
echo "  SISTEMA DE VOTACIÓN PRIVADA CON FHE - EJECUCIÓN"
echo "======================================================"

echo "[Paso 1/2] Generando votos cifrados con FHE..."
python3 offchain/generate_votes.py

if [ $? -ne 0 ]; then
    echo "Error generando votos"
    exit 1
fi

echo ""
echo "Configuración (real generada):"
if command -v jq &> /dev/null; then
    # Si jq está instalado (más limpio)
    jq -r '.configuration | "  Total votantes: \(.total_voters)\n  Votos SI: \(.yes_votes)\n  Votos NO: \(.no_votes)"' fhe_artifacts/metadata.json
else
    # Fallback sin jq (Python siempre está disponible)
    python3 -c "import json; m=json.load(open('fhe_artifacts/metadata.json')); c=m['configuration']; print(f\"  Total votantes: {c['total_voters']}\n  Votos SI: {c['yes_votes']}\n  Votos NO: {c['no_votes']}\")"
fi
echo ""

echo "[Paso 2/2] Ejecutando simulación en blockchain..."
npx hardhat run scripts/run_voting_simulation.js

if [ $? -ne 0 ]; then
    echo "Error en simulación"
    exit 1
fi

echo ""
echo "Simulación completada exitosamente"
echo ""