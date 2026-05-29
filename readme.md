# Gerador Ceruleo

Gerador de NPCs para o cenário de RPG **Cerulea**, sistema Daggerheart.
Ferramenta de mestre, sem servidor — roda inteiramente no browser.

## Como rodar localmente

A página usa `fetch()` para carregar JSON, então abrir `index.html`
direto pelo Explorador não funciona (bloqueio CORS de `file://`).

No VS Code, instale a extensão **Live Server**
(ritwickdey.LiveServer), clique com o botão direito no `index.html` e
escolha "Open with Live Server".

## Como publicar

Push para a branch `main`. GitHub Pages serve a partir da raiz.

URL pública: https://gabinska.github.io/GeradorCeruleo/

## Estrutura

```
index.html                       markup principal

css/style.css                    paleta e tipografia

js/app.js                        entry point, estado da UI
js/distribuicao.js               lógica de redistribuição
js/sorteio.js                    sorteio de ancestralidade
js/sorteioFeatures.js            sorteio de features físicas
js/sorteioNome.js                motor Markov de geração de nomes

data/ancestralidades.json
data/provincias.json
data/nomes-markov.json           modelo Markov pré-treinado (~5 MB)

treinarMarkov/                   ferramentas de treinamento do modelo
  names.csv                      base consolidada (~89k nomes,
                                 18 regiões ativas + 5 guardadas)
  names_dataset.md               documentação do dataset
                                 (fontes, decisões de mapeamento)
  preprocessar_nomes.py          script de treino do Markov
  amostras.txt                   preview gerado (NÃO versionado)
```

## Motor de nomes

Os nomes são gerados por um modelo Markov de caracteres (ordem 3)
treinado em nomes reais de pessoas, segmentado por **região cultural**
e gênero. Cada província sorteia entre regiões que a inspiram, com
pesos diferentes:

```
EMPÓDIA              leste_asiatico    70
                     sudeste_asiatico  30

CERULEA DO NORTE     ilhas_britanicas  25
                     germanica         20
                     nordica           20
                     franca            15
                     fenico_baltico     8
                     eslava_ocidental   7
                     magyar             5

ILHA DAS CORRENTES   iberica           55
                     africa_subsaariana 45

CERULEA DO SUL       arabe_persa       65
                     turca             35

DÁKRY                balca_eslava      25
                     helenica          25
                     balca_oriental    20
                     romana            15
                     hebraica          15
```

Além das 18 regiões usadas pelas províncias, o modelo também treina 5
regiões "guardadas" (`sul_asiatico`, `caucaso`, `polinesica`,
`nativo_americano`, `mesoamericana`) — sem província correspondente,
mas disponíveis no JSON pra uso futuro.

O modelo já vem pré-treinado em `data/nomes-markov.json`.
