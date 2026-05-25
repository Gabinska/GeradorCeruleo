"""
preprocessar_nomes.py — v2

Mudanças em relação ao v1:
  - Markov ordem 2 → 3 (mais fiel ao idioma; aceita coincidência com nomes reais)
  - Aceita gênero vazio como pool neutro (resolve TR/DZ/MA)
  - M e F com pool pequeno (<500) herdam do pool neutro
  - Regex rejeita nomes compostos (espaço/hífen/apóstrofo)
  - Filtro mínimo de tamanho subiu de 2 para 3 letras
  - LIMITE_POR_PAIS reduzido para compensar inflação do JSON

Uso:
  cd C:\\GeradorCeruleo\\treinarMarkov
  python preprocessar_nomes.py
"""

import json
import random
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

# =========================================================
# CONFIGURAÇÃO
# =========================================================

PASTA_CSV = Path("names")
PASTA_SAIDA_JSON = Path("../data")
ARQUIVO_AMOSTRAS = Path("amostras.txt")

PROVINCIAS = {
    "empodia": {
        "JP": 25, "KR": 20, "CN": 20,
        "ID": 10, "KH": 10, "PH": 10, "TW": 5,
    },
    "cerulea_norte": {
        "DE": 25, "GB": 20, "FR": 20,
        "SE": 15, "PL": 15, "IE": 5,
    },
    "correntes": {
        "NG": 15, "AO": 12, "ET": 12, "ZA": 12,
        "BR": 19, "ES": 15, "IT": 15,
    },
    "cerulea_sul": {
        "SA": 35, "IR": 25, "TR": 20,
        "MA": 10, "DZ": 10,
    },
    "dakry": {
        "GR": 50, "BG": 30, "RU": 20,
    },
}

# Limite por país. Markov ordem 3 satura em ~20k nomes únicos.
LIMITE_POR_PAIS = 20_000

# Markov ordem 3 — trigrama → próxima letra
ORDEM = 3

# Se M ou F tiver menos nomes que isso, herda do pool neutro
LIMITE_FALLBACK_GENERO = 500

# =========================================================
# TRANSLIT PARA PORTUGUÊS
# =========================================================
# Toda letra fora do português é convertida pra letra portuguesa
# antes de qualquer outro processamento.

# Caracteres portugueses válidos — mantidos como estão
PT_VALIDO = set("abcdefghijklmnopqrstuvwxyz"
                "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                "áéíóúâêôãõçüà"
                "ÁÉÍÓÚÂÊÔÃÕÇÜÀ")

# Casos especiais que NFKD não decompõe corretamente
TRANSLIT_ESPECIAL = {
    'ß': 'ss',
    'æ': 'a', 'Æ': 'A',
    'œ': 'o', 'Œ': 'O',
    'ø': 'o', 'Ø': 'O',
    'ł': 'l', 'Ł': 'L',
    'ð': 'd', 'Ð': 'D',
    'đ': 'd', 'Đ': 'D',
    'þ': 'th', 'Þ': 'Th',
    'ı': 'i', 'İ': 'I',
    'ñ': 'n', 'Ñ': 'N',
}


def translit(s):
    """
    Translit qualquer caractere não-PT pra letra portuguesa equivalente.
    Estratégia:
      1. Mantém se já é PT
      2. Aplica substituição especial (ß→ss, ñ→n, ł→l, etc.)
      3. Decompõe (NFKD) e pega só a base latina
      4. Se a base ainda não for PT, descarta o caractere
    """
    out = []
    for c in s:
        if c in PT_VALIDO:
            out.append(c)
            continue
        if c in TRANSLIT_ESPECIAL:
            out.append(TRANSLIT_ESPECIAL[c])
            continue
        base = unicodedata.normalize('NFKD', c)[0:1]
        if base and base in PT_VALIDO:
            out.append(base)
    return ''.join(out)


# Regex apertado: só letras portuguesas após translit
REGEX_PT = re.compile(r"^[A-Za-záéíóúâêôãõçüàÁÉÍÓÚÂÊÔÃÕÇÜÀ]+$")

VOGAIS = set("aeiouáéíóúâêôãõàüyAEIOUÁÉÍÓÚÂÊÔÃÕÀÜY")


def parece_nome(s):
    """
    Heurística estrutural anti-lixo. Rejeita:
      - Sem vogais (Mlk, Tkwm, Cdd, Pdd)
      - <20% de vogais (Strgh, Vrtsk)
      - 5+ consoantes seguidas
    """
    if not s:
        return False
    vogais_count = sum(1 for c in s if c in VOGAIS)
    if vogais_count == 0:
        return False
    if vogais_count / len(s) < 0.20:
        return False
    seguidas = 0
    for c in s:
        if c in VOGAIS:
            seguidas = 0
        else:
            seguidas += 1
            if seguidas >= 5:
                return False
    return True

# Tamanho mínimo do nome no filtro de leitura
MIN_TAMANHO_LEITURA = 3
MAX_TAMANHO_LEITURA = 20

# Geração de amostras
MIN_LETRAS_DEFAULT = 3
MAX_LETRAS_DEFAULT = 12
TENTATIVAS_REJEICAO = 50
N_AMOSTRAS_POR_BLOCO = 100


# =========================================================
# LEITURA E FILTRAGEM
# =========================================================

def ler_nomes(arquivo_csv, limite):
    """
    Lê o CSV linha por linha. Retorna 3 pools (M, F, N=gênero vazio).
    Se limite for None, lê tudo.
    """
    pools = {"M": [], "F": [], "N": []}
    lidos = 0
    descartados = 0

    try:
        with open(arquivo_csv, "r", encoding="utf-8", errors="ignore") as f:
            for linha in f:
                if limite is not None and all(len(pools[g]) >= limite for g in ("M", "F", "N")):
                    break
                lidos += 1

                partes = linha.rstrip("\n").split(",")
                if len(partes) < 4:
                    descartados += 1
                    continue

                primeiro = partes[0].strip()
                genero = partes[2].strip().upper()

                if not primeiro:
                    descartados += 1
                    continue
                if genero not in ("M", "F", ""):
                    descartados += 1
                    continue

                # Translit pra português ANTES de qualquer outro filtro
                primeiro = translit(primeiro)

                if len(primeiro) < MIN_TAMANHO_LEITURA or len(primeiro) > MAX_TAMANHO_LEITURA:
                    descartados += 1
                    continue
                if not REGEX_PT.match(primeiro):
                    descartados += 1
                    continue
                if not parece_nome(primeiro):
                    descartados += 1
                    continue

                slot = genero if genero else "N"
                if limite is not None and len(pools[slot]) >= limite:
                    continue

                pools[slot].append(primeiro.lower())
    except Exception as e:
        print(f"  ERRO lendo {arquivo_csv}: {e}")
        return None, 0, 0

    return pools, lidos, descartados


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


def gerar_nome(tabela, ordem=3, min_letras=3, max_letras=12,
               tentativas=50, cap_chars=40):
    """Gera um nome via Markov com rejection sampling de tamanho."""
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
    print(f"Pré-processamento v2 — Markov ordem {ORDEM}")
    print("=" * 60)

    if not PASTA_CSV.exists():
        print(f"\nERRO: pasta {PASTA_CSV} não existe.")
        sys.exit(1)

    PASTA_SAIDA_JSON.mkdir(exist_ok=True)

    paises = sorted({p for codigos in PROVINCIAS.values() for p in codigos})
    print(f"\nPaíses a processar ({len(paises)}): {' '.join(paises)}")
    limite_str = "sem limite" if LIMITE_POR_PAIS is None else f"{LIMITE_POR_PAIS:,} nomes/gênero"
    print(f"Limite por país: {limite_str}\n")

    modelos = {}
    estatisticas = {}
    inicio_total = time.time()

    for codigo in paises:
        arquivo = PASTA_CSV / f"{codigo}.csv"
        if not arquivo.exists():
            print(f"[{codigo}] AVISO: arquivo não encontrado, pulando.")
            continue

        t0 = time.time()
        print(f"[{codigo}] lendo... ", end="", flush=True)
        pools, lidos, descartados = ler_nomes(arquivo, LIMITE_POR_PAIS)
        if pools is None:
            continue

        nomes_m = list(set(pools["M"]))
        nomes_f = list(set(pools["F"]))
        nomes_n = list(set(pools["N"]))
        nomes_total = list(set(nomes_m + nomes_f + nomes_n))

        if not nomes_total:
            print(f"VAZIO ({lidos:,} lidas, {descartados:,} descartadas — script não-latino?)")
            estatisticas[codigo] = {
                "M_orig": 0, "F_orig": 0, "N_orig": 0,
                "unico": 0, "lidos": lidos, "vazio": True,
                "M_fallback": False, "F_fallback": False,
            }
            continue

        m_fallback = len(nomes_m) < LIMITE_FALLBACK_GENERO
        f_fallback = len(nomes_f) < LIMITE_FALLBACK_GENERO
        pool_m = nomes_total if m_fallback else nomes_m
        pool_f = nomes_total if f_fallback else nomes_f

        modelos[codigo] = {
            "M": construir_markov(pool_m, ORDEM),
            "F": construir_markov(pool_f, ORDEM),
            "N": construir_markov(nomes_total, ORDEM),
        }

        estatisticas[codigo] = {
            "M_orig": len(nomes_m),
            "F_orig": len(nomes_f),
            "N_orig": len(nomes_n),
            "unico": len(nomes_total),
            "lidos": lidos,
            "vazio": False,
            "M_fallback": m_fallback,
            "F_fallback": f_fallback,
        }

        dur = time.time() - t0
        flag_m = "↩" if m_fallback else " "
        flag_f = "↩" if f_fallback else " "
        print(f"M={len(nomes_m):>6,}{flag_m} F={len(nomes_f):>6,}{flag_f} "
              f"N={len(nomes_n):>6,}  total único={len(nomes_total):>6,}  ({dur:.1f}s)")

    # SALVA JSON
    arquivo_json = PASTA_SAIDA_JSON / "nomes-markov.json"
    dados = {
        "ordem": ORDEM,
        "provincias": PROVINCIAS,
        "modelos": modelos,
    }
    with open(arquivo_json, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))

    tamanho_mb = arquivo_json.stat().st_size / (1024 * 1024)
    print(f"\n✓ JSON salvo: {arquivo_json} ({tamanho_mb:.2f} MB)")

    # AMOSTRAS
    print(f"\nGerando amostras em {ARQUIVO_AMOSTRAS}...")
    with open(ARQUIVO_AMOSTRAS, "w", encoding="utf-8") as f:
        f.write(f"AMOSTRAS DE NOMES — Gerador Ceruleo (v2, ordem {ORDEM})\n")
        f.write(f"{N_AMOSTRAS_POR_BLOCO} nomes por (província × gênero)\n")
        f.write(f"Tamanho permitido: {MIN_LETRAS_DEFAULT}–{MAX_LETRAS_DEFAULT} letras\n")
        f.write("↩ = fallback do pool neutro (pouco dado de M/F)\n")

        for prov_id, paises_prov in PROVINCIAS.items():
            f.write("\n" + "=" * 60 + "\n")
            f.write(f"PROVÍNCIA: {prov_id.upper()}\n")
            f.write(f"Composição: {paises_prov}\n")
            f.write("=" * 60 + "\n")

            codigos_validos = [c for c in paises_prov if c in modelos]
            pesos_validos = [paises_prov[c] for c in codigos_validos]
            if not codigos_validos:
                f.write("\n(Nenhum país com modelo válido)\n")
                continue

            for genero, label in [("M", "MASCULINO"),
                                  ("F", "FEMININO"),
                                  ("N", "NEUTRO")]:
                f.write(f"\n--- {label} ---\n")
                for _ in range(N_AMOSTRAS_POR_BLOCO):
                    pais = random.choices(codigos_validos,
                                          weights=pesos_validos, k=1)[0]
                    tabela = modelos[pais].get(genero, {})
                    nome = gerar_nome(tabela, ORDEM,
                                      MIN_LETRAS_DEFAULT,
                                      MAX_LETRAS_DEFAULT,
                                      TENTATIVAS_REJEICAO)
                    if nome:
                        flag = ""
                        if genero == "M" and estatisticas[pais]["M_fallback"]:
                            flag = " ↩"
                        elif genero == "F" and estatisticas[pais]["F_fallback"]:
                            flag = " ↩"
                        f.write(f"  {nome:<20s} [{pais}]{flag}\n")

    print(f"✓ Amostras salvas: {ARQUIVO_AMOSTRAS}")

    # RESUMO
    print("\n" + "=" * 60)
    print("ESTATÍSTICAS POR PAÍS")
    print("=" * 60)
    print(f"{'PAÍS':<6} {'M':>7} {'F':>7} {'N(∅)':>7} {'ÚNICO':>7} {'FALLBACK':<12}")
    for codigo in sorted(estatisticas):
        s = estatisticas[codigo]
        fb = []
        if s.get("M_fallback"): fb.append("M")
        if s.get("F_fallback"): fb.append("F")
        fb_str = "+".join(fb) if fb else "-"
        print(f"{codigo:<6} {s['M_orig']:>7,} {s['F_orig']:>7,} "
              f"{s['N_orig']:>7,} {s['unico']:>7,} {fb_str:<12}")

    print(f"\nTempo total: {time.time() - inicio_total:.1f}s")
    print("\nPróximo passo: abrir amostras.txt e revisar.")


if __name__ == "__main__":
    main()