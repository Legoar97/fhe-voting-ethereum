## Sistema de Votación Privada con Cifrado Completamente Homomórfico en Ethereum

### Descripción General

Este repositorio contiene la implementación completa de un sistema de votación descentralizado que preserva la privacidad de votos individuales mediante criptografía completamente homomórfica (Fully Homomorphic Encryption, FHE). El proyecto fue desarrollado como parte de una tesis de pregrado en Ciencia de Datos.

El sistema demuestra la viabilidad técnica y económica de integrar FHE en contratos inteligentes de Ethereum, utilizando una arquitectura híbrida donde el cómputo intensivo se realiza off-chain y la blockchain actúa como capa de integridad y coordinación.

### Arquitectura del Sistema

**Componentes principales:**

- **Capa on-chain (Ethereum):** Registro inmutable de hashes criptográficos, validación de elegibilidad, control de quorum y verificación de integridad
- **Capa off-chain (FHE):** Cifrado de votos individuales, suma homomórfica de votos cifrados y descifrado del resultado agregado
- **Coordinador:** Entidad responsable del escrutinio homomórfico y revelación del resultado final

**Flujo del proceso:**

1. Generación de claves FHE (pública/privada)
2. Usuarios cifran sus votos con clave pública
3. Hashes de votos cifrados se registran en blockchain
4. Coordinador suma homomórficamente los votos cifrados
5. Coordinador descifra el resultado agregado
6. Resultado final se publica en blockchain

### Características Técnicas

- **Esquema criptográfico:** BFV (Brakerski-Fan-Vercauteren)
- **Parámetros de seguridad:** 128 bits (n=8192, t_bits=20)
- **Operaciones soportadas:** Suma homomórfica sobre enteros cifrados
- **Blockchain:** Ethereum (compatible con EVM)
- **Lenguaje de contratos:** Solidity 0.8.20+
- **Entorno de pruebas:** Hardhat

### Resultados Principales

Los experimentos académicos en entorno simulado demuestran:

- Sobrecosto de privacidad: 2-4% en consumo de gas
- Latencia de escrutinio FHE: aproximadamente 10-15 milisegundos
- Escalabilidad: lineal hasta 100 votantes
- Comparación justa: métricas obtenidas contra sistema público con funcionalidades equivalentes

### Requisitos del Sistema

**Software necesario:**

- Python 3.8 o superior
- Node.js 16 o superior
- npm

**Dependencias Python:**

```bash
pip install pyfhel
```

**Dependencias Node.js:**

```bash
npm install
```

### Instalación y Configuración

```bash
# Clonar repositorio
git clone https://github.com/Legoar97/fhe-voting-ethereum.git
cd fhe-voting-ethereum

# Instalar dependencias Python
pip install pyfhel

# Instalar dependencias Node.js
npm install

# Compilar contratos
npx hardhat compile
```

### Configuración de Parámetros

Todos los parámetros de simulación se configuran mediante el archivo `config/vote_simulation.json`:

```json
{
  "seed": 42,
  "question": "¿Aprobar la propuesta de mejora del protocolo DeFi?",
  "voters": {
    "total": 100,
    "yes": 65,
    "no": 35,
    "participation_rate": 0.85,
    "simulate_partial": true,
    "all_must_vote": false
  },
  "voting": {
    "period_days": 7,
    "quorum_bps": 5100
  }
}
```

**Descripción de parámetros:**

- `seed`: Semilla para generación determinista (reproducibilidad)
- `question`: Texto de la propuesta a votar
- `voters.total`: Número total de votantes elegibles
- `voters.yes`: Votos afirmativos a generar
- `voters.no`: Votos negativos a generar
- `voters.participation_rate`: Porcentaje de votantes que participarán (0.0-1.0)
- `voters.simulate_partial`: Activar simulación de participación parcial
- `voters.all_must_vote`: Forzar participación del 100% (sobrescribe participation_rate)
- `voting.period_days`: Duración del periodo de votación en días
- `voting.quorum_bps`: Quorum mínimo en basis points (5100 = 51%)

### Ejecución de Simulaciones

**Windows:**

```cmd
.\run_all.bat
```

Este script ejecuta automáticamente:
1. Generación de votos cifrados según configuración
2. Simulación completa en blockchain
3. Generación de reporte JSON

**Linux/Mac:**

```bash
./run_all.sh
```

**Modificar parámetros:**

1. Editar `config/vote_simulation.json` con los valores deseados
2. Ejecutar `.\run_all.bat`
3. Los resultados se ajustarán automáticamente a la nueva configuración

**Ejemplo de configuración alternativa:**

```json
{
  "seed": 123,
  "question": "¿Implementar nuevo protocolo de staking?",
  "voters": {
    "total": 200,
    "yes": 150,
    "no": 50,
    "participation_rate": 0.95,
    "simulate_partial": true,
    "all_must_vote": false
  },
  "voting": {
    "period_days": 14,
    "quorum_bps": 6000
  }
}
```

### Ejecución Manual (Avanzado)

Para control granular sobre cada fase:

```bash
# Paso 1: Generar votos cifrados
python generate_votes.py 100 65 35

# Paso 2: Ejecutar simulación
npx hardhat run scripts/run_voting_simulation.js
```

Nota: La ejecución manual ignora `config/vote_simulation.json` y requiere parámetros explícitos.

### Estructura del Repositorio

```
fhe-voting-ethereum/
├── contracts/
│   ├── PrivateVoting.sol          # Contrato de votación privada
│   └── PublicVoting.sol           # Contrato de referencia público
├── scripts/
│   ├── generate_votes.py          # Generador de votos FHE
│   └── run_voting_simulation.js   # Orquestador de simulación
├── config/
│   └── vote_simulation.json       # Configuración central
├── fhe_artifacts/                 # Votos cifrados y metadata (generado)
├── hardhat.config.js
├── package.json
├── run_all.bat                    # Script Windows
├── run_all.sh                     # Script Linux/Mac
└── README.md
```

### Resultados de Simulación

Cada ejecución genera `simulation_report.json`:

```json
{
  "mode": "simulation_academic",
  "seed": 42,
  "params": {
    "N_VOTERS": 100,
    "PARTICIPATION_RATE": 0.85
  },
  "gas": {
    "public_total": "8335120",
    "private_total": "8628322",
    "diff": 293202,
    "overhead_pct": 3.5
  },
  "fhe": {
    "tally_time_ms_offchain": 11.66
  },
  "results": {
    "decision": "APROBADA"
  }
}
```

### Escenarios de Prueba Sugeridos

**Escenario 1: Participación perfecta**

```json
{
  "voters": {
    "all_must_vote": true
  }
}
```

**Escenario 2: Quorum no alcanzado**

```json
{
  "voters": {
    "participation_rate": 0.45
  },
  "voting": {
    "quorum_bps": 5100
  }
}
```

**Escenario 3: Votación ajustada**

```json
{
  "voters": {
    "total": 100,
    "yes": 51,
    "no": 49
  }
}
```

**Escenario 4: Escalabilidad**

```json
{
  "voters": {
    "total": 300,
    "yes": 220,
    "no": 80
  }
}
```

### Reproducibilidad

Para reproducir resultados exactos:

1. Usar la misma semilla (`seed`)
2. Mantener idéntica la configuración de votantes
3. Ejecutar en el mismo entorno (Hardhat versión consistente)

Ejemplo:

```json
{
  "seed": 42,
  "voters": {
    "total": 100,
    "yes": 65,
    "no": 35,
    "participation_rate": 0.85
  }
}
```

Produce resultados deterministas replicables.

### Limitaciones y Consideraciones

**Limitaciones técnicas:**

1. Coordinador centralizado con clave privada única
2. Solo operaciones aditivas implementadas
3. Sin descifrado de umbral
4. Resultados válidos únicamente en entorno de pruebas

**Consideraciones operacionales:**

1. Requiere infraestructura off-chain para coordinador
2. Dependencia en disponibilidad del coordinador
3. Gestión de claves criptográficas sensibles
4. No optimizado para despliegue en mainnet

### Trabajo Futuro

- Implementación de descifrado de umbral
- Integración con Layer 2
- Soporte para operaciones más complejas
- Auditoría de seguridad profesional
- Interfaz de usuario web
- Pruebas en redes de prueba públicas

### Referencias Bibliográficas

Gentry, C. (2009). A Fully Homomorphic Encryption Scheme. Stanford University.

Solomon, R., Weber, R., & Almashaqbeh, G. (2023). smartFHE: Privacy-Preserving Smart Contracts from Fully Homomorphic Encryption. IEEE EuroS&P.

Brakerski, Z., Gentry, C., & Vaikuntanathan, V. (2012). Fully Homomorphic Encryption without Bootstrapping. ACM ITCS.

Wood, G. (2014). Ethereum: A Secure Decentralised Generalised Transaction Ledger.

### Licencia

MIT License - Consultar archivo LICENSE para términos completos.

### Información del Proyecto

**Autor:** Iván Ramiro Pinzón

**Institución:** Universidad Externado de Colombia

**Programa:** Pregrado en Ciencia de Datos

**Año:** 2025

### Contacto

Para consultas académicas o técnicas:

- Correo institucional: Ivan.pinzon3@est.uexternado.edu.co
- Repositorio: https://github.com/Legoar97/fhe-voting-ethereum

### Disclaimer

Este proyecto constituye una investigación académica experimental. No ha sido auditado para uso en producción ni está diseñado para manejar votaciones con consecuencias legales o financieras reales. El uso de este código en entornos productivos requeriría mejoras sustanciales en seguridad, descentralización, auditoría profesional y cumplimiento regulatorio.
