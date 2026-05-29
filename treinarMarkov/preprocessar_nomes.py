"""
preprocessar_nomes.py — v3

Mudanças em relação ao v2:
  - Lê um CSV único já consolidado e curado (names.csv com
    nome,genero,regiao) em vez de 50 CSVs por país.
  - Markov por região cultural (~23) em vez de por país (~50).
  - Pesos das províncias agora referem-se a regiões, não países.
  - Sem translit / sem filtros estruturais — dados já estão limpos.
  - LIMITE_FALLBACK_GENERO reduzido de 500 → 300 (pools maiores).

Uso:
  cd C:\\GeradorCeruleo\\treinarMarkov
  python preprocessar_nomes.py
"""

import csv
import json
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

# =========================================================
# CONFIGURAÇÃO
# =========================================================

ARQUIVO_CSV = Path("names.csv")
PASTA_SAIDA_JSON = Path("../data")
ARQUIVO_JSON = PASTA_SAIDA_JSON / "nomes-markov.json"
ARQUIVO_AMOSTRAS = Path("amostras.txt")

# Markov ordem 3 — trigrama → próxima letra
ORDEM = 3

# Província → região, peso (somam 100 dentro de cada província)
PROVINCIAS = {
    "cerulea_norte": {
        "ilhas_britanicas":   25,
        "germanica":          20,
        "nordica":            20,
        "franca":             15,
        "fenico_baltico":      8,
        "eslava_ocidental":    7,
        "magyar":              5,
    },
    "empodia": {
        "leste_asiatico":     70,
        "sudeste_asiatico":   30,
    },
    "correntes": {
        "iberica":            55,
        "africa_subsaariana": 45,
    },
    "cerulea_sul": {
        "arabe_persa":        65,
        "turca":              35,
    },
    "dakry": {
        "balca_eslava":       25,
        "helenica":           25,
        "balca_oriental":     20,
        "romana":             15,
        "hebraica":           15,
    },
}

# Regiões sem província correspondente — modelos treinados pra uso futuro
REGIOES_GUARDADAS = [
    "sul_asiatico", "caucaso", "polinesica",
    "nativo_americano", "mesoamericana",
]

# Se M ou F tiver menos nomes que isso, herda do pool unisex (M+F+N)
LIMITE_FALLBACK_GENERO = 300

# Defaults pra geração de amostras
MIN_LETRAS_DEFAULT = 3
MAX_LETRAS_DEFAULT = 13
TENTATIVAS_REJEICAO = 50
N_AMOSTRAS_POR_BLOCO = 80


# =========================================================
# LEITURA
# =========================================================

def ler_csv(caminho):
    """
    Lê o CSV consolidado.
    Retorna: {regiao: {'M': [nomes], 'F': [nomes], 'N': [nomes]}}
    Nomes são guardados em lowercase pra o treino do Markov.
    """
    pools = defaultdict(lambda: {"M": [], "F": [], "N": []})
    with open(caminho, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            regiao = row["regiao"]
            genero = row["genero"]
            nome = row["nome"].strip()
            if nome and genero in ("M", "F", "N"):
                pools[regiao][genero].append(nome.lower())
    return pools


# =========================================================
# MARKOV
# =========================================================

def construir_markov(nomes, ordem=3):
    """Tabela Markov: {n-grama: {próxima_letra: contagem}}."""
    tabela = defaultdict(lambda: defaultdict(int))
    inicio = "^" * ordem
    for nome in nomes:
        padded = inicio + nome + "$"
        for i in range(len(padded) - ordem):
            chave = padded[i:i + ordem]
            prox = padded[i + ordem]
            tabela[chave][prox] += 1
    return {k: dict(v) for k, v in tabela.items()}


def gerar_nome(tabela, ordem=3, min_letras=3, max_letras=13,
               tentativas=50, cap_chars=40):
    """Gera um nome via Markov com rejection sampling pra tamanho."""
    if not tabela:
        return None
    ultimo = ""
    for _ in range(tentativas):
        estado = "^" * ordem
        nome = ""
        for _ in range(cap_chars):
            opcoes = tabela.get(estado)
            if not opcoes:
                break
            chars = list(opcoes.keys())
            pesos = list(opcoes.values())
            prox = random.choices(chars, weights=pesos, k=1)[0]
            if prox == "$":
                break
            nome += prox
            estado = (estado + prox)[-ordem:]
        ultimo = nome
        if min_letras <= len(nome) <= max_letras:
            return nome.title()
    return ultimo.title() if ultimo else None


# =========================================================
# MAIN
# =========================================================

def main():
    print("=" * 60)
    print(f"Pré-processamento v3 — Markov ordem {ORDEM}")
    print("=" * 60)

    if not ARQUIVO_CSV.exists():
        print(f"\nERRO: {ARQUIVO_CSV} não encontrado.")
        sys.exit(1)

    PASTA_SAIDA_JSON.mkdir(exist_ok=True)

    print(f"\nLendo {ARQUIVO_CSV}...")
    pools = ler_csv(ARQUIVO_CSV)
    print(f"Regiões encontradas: {len(pools)}\n")

    # Conferir que todas as regiões esperadas existem no CSV
    regioes_esperadas = set(REGIOES_GUARDADAS)
    for r_dict in PROVINCIAS.values():
        regioes_esperadas.update(r_dict.keys())
    regioes_csv = set(pools.keys())

    faltando = regioes_esperadas - regioes_csv
    extra = regioes_csv - regioes_esperadas
    if faltando:
        print(f"AVISO: regiões esperadas mas não encontradas: {faltando}")
    if extra:
        print(f"AVISO: regiões no CSV mas não configuradas: {extra}")

    # Treinar Markov por (região × gênero)
    modelos = {}
    estatisticas = {}
    inicio_total = time.time()

    print(f"{'REGIÃO':<22} {'M':>7} {'F':>7} {'N':>7} {'TOTAL':>7}  FB")
    print("─" * 60)

    for regiao in sorted(regioes_esperadas):
        if regiao not in pools:
            continue

        t0 = time.time()
        nomes_m = list(set(pools[regiao]["M"]))
        nomes_f = list(set(pools[regiao]["F"]))
        nomes_n = list(set(pools[regiao]["N"]))
        nomes_total = list(set(nomes_m + nomes_f + nomes_n))

        m_fallback = len(nomes_m) < LIMITE_FALLBACK_GENERO
        f_fallback = len(nomes_f) < LIMITE_FALLBACK_GENERO

        # Pools efetivos: M ou F pequeno usa o total como fallback
        pool_m = nomes_total if m_fallback else nomes_m
        pool_f = nomes_total if f_fallback else nomes_f
        pool_n = nomes_total

        modelos[regiao] = {
            "M": construir_markov(pool_m, ORDEM),
            "F": construir_markov(pool_f, ORDEM),
            "N": construir_markov(pool_n, ORDEM),
        }
        estatisticas[regiao] = {
            "M_orig": len(nomes_m),
            "F_orig": len(nomes_f),
            "N_orig": len(nomes_n),
            "total": len(nomes_total),
            "M_fallback": m_fallback,
            "F_fallback": f_fallback,
        }

        fb = []
        if m_fallback: fb.append("M")
        if f_fallback: fb.append("F")
        fb_str = "+".join(fb) if fb else "-"

        print(f"{regiao:<22} {len(nomes_m):>7,} {len(nomes_f):>7,} "
              f"{len(nomes_n):>7,} {len(nomes_total):>7,}  {fb_str}")

    # =========================================================
    # SALVA JSON
    # =========================================================
    dados = {
        "ordem": ORDEM,
        "provincias": PROVINCIAS,
        "modelos": modelos,
    }
    with open(ARQUIVO_JSON, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))

    tamanho_mb = ARQUIVO_JSON.stat().st_size / (1024 * 1024)
    print(f"\n✓ JSON salvo: {ARQUIVO_JSON} ({tamanho_mb:.2f} MB)")

    # =========================================================
    # AMOSTRAS
    # =========================================================
    print(f"\nGerando amostras em {ARQUIVO_AMOSTRAS}...")
    with open(ARQUIVO_AMOSTRAS, "w", encoding="utf-8") as f:
        f.write(f"AMOSTRAS DE NOMES — Gerador Ceruleo (v3, ordem {ORDEM})\n")
        f.write(f"{N_AMOSTRAS_POR_BLOCO} nomes por (província × gênero)\n")
        f.write(f"Tamanho: {MIN_LETRAS_DEFAULT}–{MAX_LETRAS_DEFAULT} letras\n")
        f.write("↩ = fallback (pool unisex usado por falta de M ou F)\n")

        # Por província
        for prov_id, regioes_peso in PROVINCIAS.items():
            f.write("\n" + "=" * 60 + "\n")
            f.write(f"PROVÍNCIA: {prov_id.upper()}\n")
            f.write(f"Regiões: {regioes_peso}\n")
            f.write("=" * 60 + "\n")

            regs_validas = [r for r in regioes_peso if r in modelos]
            pesos_validos = [regioes_peso[r] for r in regs_validas]
            if not regs_validas:
                f.write("(Nenhuma região com modelo válido)\n")
                continue

            for genero, label in [("M", "MASCULINO"),
                                  ("F", "FEMININO"),
                                  ("N", "NEUTRO")]:
                f.write(f"\n--- {label} ---\n")
                for _ in range(N_AMOSTRAS_POR_BLOCO):
                    reg = random.choices(regs_validas,
                                         weights=pesos_validos, k=1)[0]
                    tabela = modelos[reg].get(genero, {})
                    nome = gerar_nome(tabela, ORDEM,
                                      MIN_LETRAS_DEFAULT,
                                      MAX_LETRAS_DEFAULT,
                                      TENTATIVAS_REJEICAO)
                    if nome:
                        flag = ""
                        if genero == "M" and estatisticas[reg]["M_fallback"]:
                            flag = " ↩"
                        elif genero == "F" and estatisticas[reg]["F_fallback"]:
                            flag = " ↩"
                        f.write(f"  {nome:<20s} [{reg}]{flag}\n")

        # Regiões guardadas (sem província) — amostras avulsas
        f.write("\n" + "=" * 60 + "\n")
        f.write("REGIÕES GUARDADAS (sem província correspondente)\n")
        f.write("=" * 60 + "\n")
        for regiao in REGIOES_GUARDADAS:
            if regiao not in modelos:
                continue
            f.write(f"\n### {regiao.upper()}\n")
            for genero, label in [("M", "M"), ("F", "F"), ("N", "N")]:
                tabela = modelos[regiao].get(genero, {})
                amostras = [gerar_nome(tabela, ORDEM,
                                       MIN_LETRAS_DEFAULT,
                                       MAX_LETRAS_DEFAULT,
                                       TENTATIVAS_REJEICAO)
                            for _ in range(20)]
                amostras = [a for a in amostras if a]
                f.write(f"  {label}: {', '.join(amostras)}\n")

    print(f"✓ Amostras salvas: {ARQUIVO_AMOSTRAS}")

    # =========================================================
    # RESUMO
    # =========================================================
    print(f"\nTempo total: {time.time() - inicio_total:.1f}s")
    print(f"Regiões treinadas: {len(modelos)}")
    print(f"  {sum(1 for r in modelos if r in REGIOES_GUARDADAS)} guardadas + "
          f"{sum(1 for r in modelos if r not in REGIOES_GUARDADAS)} ativas")
    print("\nPróximo passo: abrir amostras.txt e revisar.")


if __name__ == "__main__":
    main()