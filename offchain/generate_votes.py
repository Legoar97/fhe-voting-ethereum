import time, os, hashlib, sys, json
from pathlib import Path
from Pyfhel import Pyfhel

# Ruta del JSON central (env VOTE_CONF o default)
CONFIG_PATH = os.getenv("VOTE_CONF", os.path.join("config", "vote_simulation.json"))

def load_conf():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def generate_votes(n_voters, yes_votes, no_votes, question):
    assert yes_votes + no_votes == n_voters, f"Error: {yes_votes} + {no_votes} ≠ {n_voters}"

    print("="*60)
    print("GENERADOR DE VOTOS CIFRADOS FHE")
    print("="*60)
    print(f"Total votantes: {n_voters}")
    print(f"Votos SÍ:       {yes_votes} ({yes_votes/n_voters*100:.1f}%)")
    print(f"Votos NO:       {no_votes} ({no_votes/n_voters*100:.1f}%)")
    print("="*60)

    print("\n[*] Inicializando contexto FHE...")
    HE = Pyfhel()
    HE.contextGen(scheme='bfv', n=8192, t_bits=20, sec=128)
    HE.keyGen()
    print("Claves FHE generadas")

    output_dir = "fhe_artifacts"
    os.makedirs(output_dir, exist_ok=True)
    HE.save_public_key(os.path.join(output_dir, "publickey.key"))
    HE.save_secret_key(os.path.join(output_dir, "secretkey.key"))
    print(f"Claves guardadas en {output_dir}/")

    ptxt_yes = HE.encode(1)
    ptxt_no = HE.encode(0)

    vote_ciphertexts = []
    vote_info = []

    print(f"\n[*] Generando {yes_votes} votos SÍ...")
    for i in range(yes_votes):
        ctxt = HE.encryptPtxt(ptxt_yes)
        vote_ciphertexts.append(ctxt)
        vote_bytes = ctxt.to_bytes()
        fn = os.path.join(output_dir, f"vote_{i:03d}_YES.bin")
        open(fn, "wb").write(vote_bytes)
        vote_info.append({
            "index": i, "vote": "YES", "filename": f"vote_{i:03d}_YES.bin",
            "hash": hashlib.sha3_256(vote_bytes).hexdigest(), "size_bytes": len(vote_bytes)
        })
        if (i + 1) % 20 == 0: print(f"    Procesados {i + 1}/{yes_votes}...")

    print(f"\n[*] Generando {no_votes} votos NO...")
    for i in range(no_votes):
        ctxt = HE.encryptPtxt(ptxt_no)
        vote_ciphertexts.append(ctxt)
        vote_bytes = ctxt.to_bytes()
        idx = yes_votes + i
        fn = os.path.join(output_dir, f"vote_{idx:03d}_NO.bin")
        open(fn, "wb").write(vote_bytes)
        vote_info.append({
            "index": idx, "vote": "NO", "filename": f"vote_{idx:03d}_NO.bin",
            "hash": hashlib.sha3_256(vote_bytes).hexdigest(), "size_bytes": len(vote_bytes)
        })
        if (i + 1) % 20 == 0: print(f"    Procesados {i + 1}/{no_votes}...")

    print(f"[✓] {n_voters} votos cifrados generados")

    print("\n[*] Realizando escrutinio homomórfico...")
    t0 = time.time()
    final_tally_ctxt = HE.encryptPtxt(HE.encode(0))
    for ctxt in vote_ciphertexts: final_tally_ctxt += ctxt
    tally_time_ms = (time.time() - t0) * 1000.0
    print(f"[✓] Escrutinio completado en {tally_time_ms:.2f} ms")

    final_tally_bytes = final_tally_ctxt.to_bytes()
    final_tally_filename = os.path.join(output_dir, "final_tally.bin")
    open(final_tally_filename, "wb").write(final_tally_bytes)
    final_tally_hash = hashlib.sha3_256(final_tally_bytes).hexdigest()

    print("\n[*] Descifrando resultado para verificación...")
    result_yes = HE.decode(HE.decryptPtxt(final_tally_ctxt))[0]
    result_no = n_voters - result_yes
    assert result_yes == yes_votes, f"Esperaba {yes_votes} SÍ, obtuve {result_yes}"
    assert result_no == no_votes, f"Esperaba {no_votes} NO, obtuve {result_no}"

    print("\n" + "="*60)
    print("RESULTADOS DE LA VOTACIÓN (VERIFICACIÓN OFF-CHAIN)")
    print("="*60)
    print(f"Total votantes: {n_voters}")
    print(f"Votos SÍ:       {result_yes} ({result_yes/n_voters*100:.1f}%)")
    print(f"Votos NO:       {result_no} ({result_no/n_voters*100:.1f}%)")
    print(f"Tiempo FHE:     {tally_time_ms:.2f} ms")
    print("="*60)
    print("[✓] Verificación: Escrutinio homomórfico CORRECTO")
    print("="*60)

    metadata = {
        "question": question,
        "configuration": {
            "total_voters": n_voters,
            "yes_votes": yes_votes,
            "no_votes": no_votes
        },
        "results": {
            "yes_votes": int(result_yes),
            "no_votes": int(result_no),
            "total_votes": n_voters
        },
        "performance": {
            "tally_time_ms": tally_time_ms,
            "avg_time_per_vote_ms": tally_time_ms / n_voters
        },
        "cryptography": {
            "scheme": "BFV",
            "security_bits": 128,
            "polynomial_degree": 8192,
            "plaintext_modulus_bits": 20
        },
        "final_tally": {
            "filename": "final_tally.bin",
            "hash": final_tally_hash,
            "size_bytes": len(final_tally_bytes)
        },
        "votes": vote_info
    }

    open(os.path.join(output_dir, "metadata.json"), "w", encoding="utf-8").write(
        json.dumps(metadata, indent=2)
    )
    print(f"\n[✓] Metadata guardada en fhe_artifacts/metadata.json")
    print(f"\n[✓] Todos los artefactos generados en: fhe_artifacts/")
    return metadata

if __name__ == "__main__":
    # Leer SIEMPRE del JSON
    CONFIG_PATH = os.getenv("VOTE_CONF", os.path.join("config", "vote_simulation.json"))
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        conf = json.load(f)

    N_VOTERS = int(conf["voters"]["total"])
    YES_VOTES = int(conf["voters"]["yes"])
    NO_VOTES = int(conf["voters"]["no"])
    QUESTION = conf.get("question", "")

    # (Opcional) permitir CLI solo si se establece ALLOW_CLI_ARGS=1
    if os.getenv("ALLOW_CLI_ARGS") == "1" and len(sys.argv) == 4:
        N_VOTERS = int(sys.argv[1]); YES_VOTES = int(sys.argv[2]); NO_VOTES = int(sys.argv[3])

    # Ajuste por si no suman
    if YES_VOTES + NO_VOTES != N_VOTERS:
        p = YES_VOTES / max(1, YES_VOTES + NO_VOTES)
        YES_VOTES = round(p * N_VOTERS)
        NO_VOTES = N_VOTERS - YES_VOTES

    try:
        generate_votes(N_VOTERS, YES_VOTES, NO_VOTES, QUESTION)
        print("\n Proceso completado exitosamente")
    except Exception as e:
        print(f"\n Error: {e}")
        sys.exit(1)
