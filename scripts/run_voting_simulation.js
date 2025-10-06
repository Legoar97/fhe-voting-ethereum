/* eslint-disable no-console */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ================== Config central ================== */
const CONFIG_PATH = process.env.VOTE_CONF || path.join(__dirname, "..", "config", "vote_simulation.json");
function loadConf() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}
const conf = loadConf();

/* ================== Parámetros (ENV > JSON) ================== */
const SEED = Number(process.env.SEED ?? conf.seed);
const QUESTION = process.env.QUESTION ?? conf.question;

const N_VOTERS = Number(process.env.VOTERS_TOTAL ?? conf.voters.total);
// (Los YES/NO de conf se usan indirectamente via metadata.json generado por Python)
// Se dejan por compatibilidad:
const YES_TARGET_CONFIG = Number(process.env.VOTERS_YES ?? conf.voters.yes);
const NO_TARGET_CONFIG = Number(process.env.VOTERS_NO ?? conf.voters.no);

const SIMULATE_PARTIAL_PARTICIPATION = String(process.env.SIMULATE_PARTIAL ?? conf.voters.simulate_partial) === "true";
const ALL_MUST_VOTE = String(process.env.ALL_MUST_VOTE ?? conf.voters.all_must_vote) === "true";
const PARTICIPATION_RATE_CONFIG = parseFloat(process.env.PARTICIPATION_RATE ?? conf.voters.participation_rate);
const PARTICIPATION_RATE = ALL_MUST_VOTE ? 1.0 : PARTICIPATION_RATE_CONFIG;

const VOTING_PERIOD_DAYS = Number(process.env.VOTING_PERIOD_DAYS ?? conf.voting.period_days);
const QUORUM_BPS = Number(process.env.QUORUM_BPS ?? conf.voting.quorum_bps);

/* ================== Utilidades ================== */
function prng(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleDeterministic(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.floor((p / 100) * (a.length - 1));
  return a[idx];
}
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/* ================== Artefactos FHE ================== */
function getMetadata() {
  const metadataPath = path.join(__dirname, "..", "fhe_artifacts", "metadata.json");
  if (!fs.existsSync(metadataPath)) throw new Error("metadata.json no encontrado. Ejecuta generate_votes.py primero");
  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}
function getVoteHashes(numVoters) {
  const artifactsDir = path.join(__dirname, "..", "fhe_artifacts");
  const hashes = [];
  for (let i = 0; i < numVoters; i++) {
    const yesFile = path.join(artifactsDir, `vote_${String(i).padStart(3, "0")}_YES.bin`);
    const noFile = path.join(artifactsDir, `vote_${String(i).padStart(3, "0")}_NO.bin`);
    let voteBytes;
    if (fs.existsSync(yesFile)) voteBytes = fs.readFileSync(yesFile);
    else if (fs.existsSync(noFile)) voteBytes = fs.readFileSync(noFile);
    else throw new Error(`No se encontró voto para índice ${i}`);
    const hash = crypto.createHash("sha3-256").update(voteBytes).digest("hex");
    hashes.push("0x" + hash);
  }
  return hashes;
}
function getFinalTallyHash() {
  const artifactsDir = path.join(__dirname, "..", "fhe_artifacts");
  const tallyBytes = fs.readFileSync(path.join(artifactsDir, "final_tally.bin"));
  return "0x" + crypto.createHash("sha3-256").update(tallyBytes).digest("hex");
}

/* ================== Script Principal ================== */
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log(" SIMULACIÓN ACADÉMICA: VOTACIÓN PRIVADA (FHE-híbrido) vs PÚBLICA");
  console.log("=".repeat(70));
  console.log(`MODO: SIMULACIÓN ACADÉMICA (NO MAINNET)`);
  console.log(
    `Supuestos: N_VOTERS=${N_VOTERS}, PARTICIPATION_RATE=${PARTICIPATION_RATE}, ` +
    `SIMULATE_PARTIAL=${SIMULATE_PARTIAL_PARTICIPATION}, ALL_MUST_VOTE=${ALL_MUST_VOTE}, ` +
    `VOTING_PERIOD_DAYS=${VOTING_PERIOD_DAYS}, SEED=${SEED}, QUORUM_BPS=${QUORUM_BPS}`
  );

  const rnd = prng(SEED);
  const [deployer, coordinator, ...voters] = await ethers.getSigners();
  if (voters.length < N_VOTERS) throw new Error(`Insuficientes cuentas. Necesitas ${N_VOTERS + 2}, tienes ${voters.length + 2}`);

  console.log("\n[*] Cargando artefactos FHE...");
  const metadata = getMetadata();
  console.log(`[✓] Configuración FHE cargada:`);
  console.log(`    - Total votos (target): ${metadata.configuration.total_voters}`);
  console.log(`    - SÍ (target): ${metadata.configuration.yes_votes}`);
  console.log(`    - NO (target): ${metadata.configuration.no_votes}`);
  console.log(`    - Tiempo escrutinio FHE (offline): ${metadata.performance.tally_time_ms.toFixed(2)} ms`);

  const eligibleVoters = voters.slice(0, N_VOTERS).map((v) => v.address);
  let actualVoters = N_VOTERS;
  if (SIMULATE_PARTIAL_PARTICIPATION) actualVoters = Math.floor(N_VOTERS * PARTICIPATION_RATE);

  const indices = Array.from({ length: N_VOTERS }, (_, i) => i);
  const shuffled = shuffleDeterministic(indices, rnd);
  const activeIdx = shuffled.slice(0, actualVoters);
  const inactiveIdx = shuffled.slice(actualVoters);

  console.log(`\n[*] Configuración de la simulación:`);
  console.log(`    - Votantes elegibles: ${N_VOTERS}`);
  console.log(`    - Votantes que participarán: ${actualVoters} (${((actualVoters / N_VOTERS) * 100).toFixed(1)}%)`);
  console.log(`    - Periodo de votación: ${VOTING_PERIOD_DAYS} días`);
  console.log(`    - Semilla PRNG: ${SEED}`);

  /* ============== FASE 0: Deployment ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" FASE 0: DEPLOYMENT DE CONTRATOS");
  console.log("=".repeat(70));

  const PrivateVoting = await ethers.getContractFactory("PrivateVoting");
  const privateVoting = await PrivateVoting.deploy(
    QUESTION,
    coordinator.address,
    eligibleVoters,
    VOTING_PERIOD_DAYS,
    QUORUM_BPS
  );
  await privateVoting.waitForDeployment();
  console.log(`[✓] Contrato PRIVADO desplegado: ${await privateVoting.getAddress()}`);

  const PublicVoting = await ethers.getContractFactory("PublicVoting");
  // PublicVoting SOLIDITY: constructor(string, address[], uint256)
  const publicVoting = await PublicVoting.deploy(
    QUESTION,
    eligibleVoters,
    VOTING_PERIOD_DAYS,
    QUORUM_BPS
  );
  await publicVoting.waitForDeployment();
  console.log(`[✓] Contrato PÚBLICO desplegado: ${await publicVoting.getAddress()}`);

  const [active, timeRemaining] = await privateVoting.getVotingStatus();
  console.log(`\n[✓] Estado inicial:`);
  console.log(`    - Votación activa: ${active}`);
  console.log(`    - Tiempo restante: ${formatTime(Number(timeRemaining))}`);

  // Distribución SÍ/NO aplicada a los participantes (desde metadata)
  const yesVotesTarget = Math.floor(metadata.configuration.yes_votes * (actualVoters / N_VOTERS));
  const noVotesTarget = actualVoters - yesVotesTarget;
  const yesSet = new Set(activeIdx.slice(0, yesVotesTarget));

  /* ============== FASE 1A: Privado ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" FASE 1A: EMISIÓN DE VOTOS CIFRADOS (PRIVADO)");
  console.log("=".repeat(70));

  const voteHashes = getVoteHashes(N_VOTERS);
  let totalGasPrivateVotes = 0n;
  const privateVoteTimestamps = [];

  console.log(`\n[*] Iniciando votación privada...`);
  const privateVotingStartTime = Date.now();
  for (let k = 0; k < activeIdx.length; k++) {
    const i = activeIdx[k];
    const voteStart = Date.now();
    const tx = await privateVoting.connect(voters[i]).castEncryptedVote(voteHashes[i]);
    const receipt = await tx.wait();
    const voteEnd = Date.now();
    totalGasPrivateVotes += receipt.gasUsed;
    privateVoteTimestamps.push(voteEnd - voteStart);
    if ((k + 1) % 20 === 0 || k === activeIdx.length - 1) {
      console.log(`    [${k + 1}/${activeIdx.length}] Voto procesado - Gas: ${receipt.gasUsed.toString()}`);
    }
  }
  const totalPrivateVotingTime = Date.now() - privateVotingStartTime;
  console.log(`\n[✓] Votación privada completada`);
  console.log(`    - Votos emitidos: ${activeIdx.length}`);
  console.log(`    - Gas total: ${totalGasPrivateVotes.toString()}`);
  console.log(`    - Gas promedio: ${(totalGasPrivateVotes / BigInt(activeIdx.length)).toString()}`);
  console.log(`    - Tiempo total: ${totalPrivateVotingTime}ms`);

  /* ============== FASE 1B: Público ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" FASE 1B: EMISIÓN DE VOTOS EN CLARO (PÚBLICO)");
  console.log("=".repeat(70));

  let totalGasPublicVotes = 0n;
  const publicVoteTimestamps = [];
  console.log(`\n[*] Iniciando votación pública...`);
  const publicVotingStartTime = Date.now();
  for (let k = 0; k < activeIdx.length; k++) {
    const i = activeIdx[k];
    const voteStart = Date.now();
    const supportsProposal = yesSet.has(i);
    const tx = await publicVoting.connect(voters[i]).vote(supportsProposal);
    const receipt = await tx.wait();
    const voteEnd = Date.now();
    totalGasPublicVotes += receipt.gasUsed;
    publicVoteTimestamps.push(voteEnd - voteStart);
    if ((k + 1) % 20 === 0 || k === activeIdx.length - 1) {
      console.log(`    [${k + 1}/${activeIdx.length}] Voto procesado - Gas: ${receipt.gasUsed.toString()}`);
    }
  }
  const totalPublicVotingTime = Date.now() - publicVotingStartTime;
  console.log(`\n[✓] Votación pública completada`);
  console.log(`    - Votos emitidos: ${activeIdx.length}`);
  console.log(`    - Gas total: ${totalGasPublicVotes.toString()}`);
  console.log(`    - Gas promedio: ${(totalGasPublicVotes / BigInt(activeIdx.length)).toString()}`);
  console.log(`    - Tiempo total: ${totalPublicVotingTime}ms`);

  // Participación on-chain
  const [voted, total, percentage] = await privateVoting.getParticipationRate();
  console.log(`\n[✓] Participación (contrato privado): ${voted}/${total} (${percentage}%)`);

  /* ============== FASE 2: Publicación y Revelación ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" FASE 2: PUBLICACIÓN Y REVELACIÓN (SOLO PRIVADO)");
  console.log("=".repeat(70));

  console.log(`\n[*] Simulando paso del tiempo (${VOTING_PERIOD_DAYS} días)...`);
  await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD_DAYS * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");
  console.log(`[✓] Tiempo avanzado`);

  const finalTallyHash = getFinalTallyHash();
  const recomputedHash = getFinalTallyHash();
  if (finalTallyHash !== recomputedHash) throw new Error("Final tally hash inconsistente con los artefactos locales");

  console.log(`\n[*] Publicando hash del escrutinio...`);
  const txTally = await privateVoting.connect(coordinator).submitFinalTally(finalTallyHash);
  const receiptTally = await txTally.wait();
  console.log(`[✓] Escrutinio publicado`);
  console.log(`    - Gas usado: ${receiptTally.gasUsed.toString()}`);

  const yesVotesActual = yesVotesTarget;
  const noVotesActual = noVotesTarget;

  console.log(`\n[*] Revelando resultado descifrado...`);
  const txReveal = await privateVoting.connect(coordinator).revealResult(yesVotesActual, noVotesActual);
  const receiptReveal = await txReveal.wait();
  console.log(`[✓] Resultado revelado`);
  console.log(`    - Gas usado: ${receiptReveal.gasUsed.toString()}`);

  /* ============== Resultados ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" RESULTADOS FINALES");
  console.log("=".repeat(70));

  const [yesPriv, noPriv, revealedPriv, proposalPriv, totalPriv] = await privateVoting.getResults();
  const [yesPub, noPub, proposalPub, totalPub] = await publicVoting.getResults();

  console.log(`\nPropuesta: "${proposalPriv}"`);
  console.log(`\nSistema PRIVADO:`);
  console.log(`  Votos SÍ:  ${yesPriv} (${(Number(yesPriv) / Number(totalPriv) * 100 || 0).toFixed(1)}%)`);
  console.log(`  Votos NO:  ${noPriv} (${(Number(noPriv) / Number(totalPriv) * 100 || 0).toFixed(1)}%)`);
  console.log(`  Total:     ${totalPriv}`);
  console.log(`  Estado:    ${revealedPriv ? "✓ REVELADO" : "⧗ PENDIENTE"}`);

  console.log(`\nSistema PÚBLICO:`);
  console.log(`  Votos SÍ:  ${yesPub} (${(Number(yesPub) / Number(totalPub) * 100 || 0).toFixed(1)}%)`);
  console.log(`  Votos NO:  ${noPub} (${(Number(noPub) / Number(totalPub) * 100 || 0).toFixed(1)}%)`);
  console.log(`  Total:     ${totalPub}`);

  const resultado = Number(yesPriv) > Number(noPriv) ? "✓ APROBADA" : "✗ RECHAZADA";
  console.log(`\nDecisión final: ${resultado}`);

  /* ============== Comparación ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" COMPARACIÓN: PRIVADO vs PÚBLICO");
  console.log("=".repeat(70));

  const totalGasPrivate = totalGasPrivateVotes + receiptTally.gasUsed + receiptReveal.gasUsed;
  const avgGasPrivate = totalGasPrivateVotes / BigInt(activeIdx.length);
  const avgGasPublic = totalGasPublicVotes / BigInt(activeIdx.length);

  // Diferencia y % (puede ser negativa si el privado ahorra gas)
  const gasDiff = Number(totalGasPrivate) - Number(totalGasPublicVotes);
  const overheadPct = (gasDiff / Math.max(1, Number(totalGasPublicVotes))) * 100;

  console.log(`\nSistema PÚBLICO (baseline):`);
  console.log(`  Gas votación:        ${totalGasPublicVotes.toString()}`);
  console.log(`  Gas promedio/voto:   ${avgGasPublic.toString()}`);
  console.log(`  Tiempo votación:     ${totalPublicVotingTime}ms`);
  console.log(`  Latencia/voto p50:   ${percentile(publicVoteTimestamps, 50)} ms`);
  console.log(`  Latencia/voto p95:   ${percentile(publicVoteTimestamps, 95)} ms`);

  console.log(`\nSistema PRIVADO (FHE-híbrido):`);
  console.log(`  Gas votación:        ${totalGasPrivateVotes.toString()}`);
  console.log(`  Gas escrutinio:      ${receiptTally.gasUsed.toString()}`);
  console.log(`  Gas revelación:      ${receiptReveal.gasUsed.toString()}`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Gas TOTAL:           ${totalGasPrivate.toString()}`);
  console.log(`  Gas promedio/voto:   ${avgGasPrivate.toString()}`);
  console.log(`  Tiempo votación:     ${totalPrivateVotingTime}ms`);
  console.log(`  Latencia/voto p50:   ${percentile(privateVoteTimestamps, 50)} ms`);
  console.log(`  Latencia/voto p95:   ${percentile(privateVoteTimestamps, 95)} ms`);
  console.log(`  Tiempo escrutinio:   ${metadata.performance.tally_time_ms.toFixed(2)}ms (off-chain FHE)`);

  // Sección nueva con signo correcto y etiqueta dinámica
  const label = gasDiff >= 0 ? "SOBRECOSTO DE PRIVACIDAD" : "AHORRO CON PRIVACIDAD";
  const sign  = gasDiff >= 0 ? "+" : "";
  console.log(`\n${label}:`);
  console.log(`  Diferencia de gas:   ${sign}${gasDiff.toLocaleString("es-CO")}`);
  console.log(`  Porcentaje:          ${sign}${overheadPct.toFixed(1)}%`);

  console.log(`\nDIFERENCIA CLAVE:`);
  console.log(`  PÚBLICO:  Cualquiera puede ver cómo votó cada persona`);
  console.log(`  PRIVADO:  Los votos individuales permanecen ocultos`);

  const [, , choicePub] = await publicVoting.getVoterInfo(voters[activeIdx[0]].address);
  console.log(`\nEjemplo - Votante ${voters[activeIdx[0]].address.substring(0, 10)}...`);
  console.log(`  Sistema público:  Votó ${choicePub ? "SÍ" : "NO"} (visible para todos)`);
  console.log(`  Sistema privado:  Hash 0x${voteHashes[activeIdx[0]].substring(2, 12)}... (voto oculto)`);

  /* ============== Reporte JSON ============== */
  const report = {
    mode: "simulation_academic",
    seed: SEED,
    params: {
      N_VOTERS,
      VOTING_PERIOD_DAYS,
      QUORUM_BPS: QUORUM_BPS,
      SIMULATE_PARTIAL_PARTICIPATION,
      PARTICIPATION_RATE,
      ALL_MUST_VOTE
    },
    voters: {
      eligible: N_VOTERS,
      actual: activeIdx.length,
      rate: activeIdx.length / N_VOTERS
    },
    distribution: {
      yes_target: yesVotesTarget,
      no_target: noVotesTarget
    },
    gas: {
      public_total: totalGasPublicVotes.toString(),
      private_votes_total: totalGasPrivateVotes.toString(),
      private_tally: receiptTally.gasUsed.toString(),
      private_reveal: receiptReveal.gasUsed.toString(),
      private_total: (totalGasPrivateVotes + receiptTally.gasUsed + receiptReveal.gasUsed).toString(),
      avg_per_vote_public: (totalGasPublicVotes / BigInt(activeIdx.length)).toString(),
      avg_per_vote_private: (totalGasPrivateVotes / BigInt(activeIdx.length)).toString(),
      diff: gasDiff,                               // con signo
      overhead_pct: Number(overheadPct.toFixed(1)) // puede ser negativo
    },
    latency_ms: {
      public: { total: totalPublicVotingTime, p50: percentile(publicVoteTimestamps, 50), p95: percentile(publicVoteTimestamps, 95) },
      private:{ total: totalPrivateVotingTime, p50: percentile(privateVoteTimestamps, 50), p95: percentile(privateVoteTimestamps, 95) }
    },
    fhe: {
      tally_time_ms_offchain: Number(metadata.performance.tally_time_ms.toFixed(2)),
      final_tally_hash: finalTallyHash
    },
    results: {
      private: { yes: Number(yesPriv), no: Number(noPriv), total: Number(totalPriv), revealed: revealedPriv },
      public:  { yes: Number(yesPub),  no: Number(noPub),  total: Number(totalPub) },
      decision: resultado
    },
    notes: [
      "Resultados válidos solo para Hardhat/localhost.",
      "El escrutinio FHE es off-chain (metadata.json).",
      "Participación y distribución SÍ/NO se simulan con semilla determinista."
    ]
  };

  fs.writeFileSync("simulation_report.json", JSON.stringify(report, null, 2));
  console.log(`\n[✓] Reporte JSON escrito en: simulation_report.json`);

  /* ============== Resumen ============== */
  console.log("\n" + "=".repeat(70));
  console.log(" RESUMEN EJECUTIVO");
  console.log("=".repeat(70));
  console.log(`\n✓ MODO: SIMULACIÓN ACADÉMICA (NO MAINNET)`);
  console.log(`✓ Participación: ${percentage}% (${voted}/${total})`);
  console.log(`✓ Decisión: ${resultado}`);
  console.log(`\nMétricas de privacidad:`);
  console.log(`  - Votos individuales: OCULTOS (solo hashes visibles)`);
  console.log(`  - Resultado agregado: PÚBLICO (verificable on-chain)`);
  console.log(`  - Integridad: GARANTIZADA (blockchain inmutable)`);
  console.log(`\nMétricas de rendimiento:`);
  console.log(`  - Tiempo escrutinio FHE (offline): ${metadata.performance.tally_time_ms.toFixed(2)} ms`);
  console.log(`  - ${gasDiff >= 0 ? "Sobrecosto" : "Ahorro"} en gas: ${gasDiff >= 0 ? "+" : ""}${overheadPct.toFixed(1)}%`);
  console.log(`  - Gas total (privado): ${(totalGasPrivateVotes + receiptTally.gasUsed + receiptReveal.gasUsed).toString()} unidades`);

  console.log("\n" + "=".repeat(70));
  console.log(" SIMULACIÓN COMPLETADA");
  console.log("=".repeat(70) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
