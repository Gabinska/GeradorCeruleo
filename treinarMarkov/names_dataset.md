# Base de Nomes Consolidada — Gerador Ceruleo

Dataset unificado pra treino do gerador Markov de nomes.
Última atualização: 2026-05-29.

## Arquivo

`nomes_consolidado.csv` — 3 colunas:

```
nome,genero,regiao
```

- **nome**: ASCII puro, sem acentos, Title Case
- **genero**: `M`, `F` ou `N`
- **regiao**: uma de 23 regiões (18 ativas + 5 guardadas)

Total: **89,231 linhas** únicas.


## Regiões ativas (18)

```
REGIÃO                   TOTAL      M      F      N  PROVÍNCIA
──────────────────────────────────────────────────────────────────────────────
leste_asiatico          17,777  6,330  3,761  7,686  Empódia
sudeste_asiatico        10,729  5,929  4,588    212  Empódia
germanica                8,762  4,099  4,403    260  Cerulea do Norte
africa_subsaariana       8,434  5,640  2,643    151  Ilha das Correntes
ilhas_britanicas         7,441  3,190  3,873    378  Cerulea do Norte
balca_eslava             5,882  3,050  2,805     27  Dákry
iberica                  5,070  2,568  2,468     34  Ilha das Correntes
balca_oriental           3,729  1,775  1,948      6  Dákry
fenico_baltico           3,385  1,772  1,605      8  Cerulea do Norte
nordica                  3,234  1,571  1,647     16  Cerulea do Norte
turca                    2,725  1,385  1,280     60  Cerulea do Sul
arabe_persa              2,696  1,557  1,068     71  Cerulea do Sul
hebraica                 2,038  1,204    749     85  Dákry
franca                   1,998    731  1,212     55  Cerulea do Norte
helenica                 1,562    784    774      4  Dákry
eslava_ocidental         1,245    576    668      1  Cerulea do Norte
romana                     667    430    231      6  Dákry
magyar                     575    254    319      2  Cerulea do Norte
──────────────────────────────────────────────────────────────────────────────
SUB-TOTAL               87,949
```

## Regiões guardadas (5)

Disponíveis pra uso futuro caso queira NPCs de fora de Cerulea ou inspirar uma nova província.

```
REGIÃO                   TOTAL      M      F      N
──────────────────────────────────────────────────
sul_asiatico               762    416    268     78
caucaso                    298    198     97      3
polinesica                 114     39     49     26
nativo_americano            69     34     31      4
mesoamericana               39     16     22      1
──────────────────────────────────────────────────
SUB-TOTAL                1,282
```

## Pontos de atenção pro Markov

**`leste_asiatico` tem N (7.588) inflado**
KarlAmort marca todos os 7.277 nomes chineses como unisex (pinyin não revela gênero).
O preprocessar deve aplicar fallback: pools M e F dessa região com volume insuficiente
devem herdar do pool unisex.

**`sudeste_asiatico` tem disparidade M >> F**
Tailandês trouxe 7.124 nomes M contra 5.098 F. Pool F é menor mas ainda viável.

**Regiões pequenas, em risco de regurgitação**
`magyar` (719), `romana` (667) e `mesoamericana` (39) têm pools onde Markov ordem 3
vai regurgitar nomes inteiros com frequência. Aceito como compromisso —
`romana` é categoria histórica fechada, `magyar` ainda pode receber mais dados depois.
