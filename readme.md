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
data/nomes-markov.json           modelo Markov pré-treinado (~11 MB)

treinarMarkov/                   ferramentas de regeneração do modelo
  preprocessar_nomes.py          script de treinamento
  names/                         dataset philipperemy (NÃO versionado)
  amostras.txt                   preview gerado (NÃO versionado)
```

## Motor de nomes

Os nomes são gerados por um modelo Markov de caracteres (ordem 3)
treinado em nomes reais de pessoas, segmentado por cultura e
gênero. Cada província sorteia entre os países que a inspiram:

```
Empódia            JP KR CN ID KH PH TW       (Extremo Oriente)
Cerulea do Norte   DE GB FR SE PL IE          (Europa)
Ilha das Correntes NG AO ET ZA BR ES IT       (África + Mediterrâneo)
Cerulea do Sul     SA IR TR MA DZ             (Oriente Médio + Magreb)
Dákry              GR BG RU                   (Greco-Eslavo)
```

O modelo já vem pré-treinado em `data/nomes-markov.json`.
**Não é necessário rodar o script Python para usar o app.**

### Regenerando o modelo

Só é necessário se você quiser mexer nos pesos das províncias,
trocar países ou ajustar filtros.

1. Baixe o dataset
   [philipperemy/name-dataset](https://github.com/philipperemy/name-dataset)
   (~10 GB descompactado, MIT)

2. Coloque os CSVs em `treinarMarkov/names/`

3. Edite `treinarMarkov/preprocessar_nomes.py` se quiser ajustar
   configurações (PROVINCIAS, LIMITE_POR_PAIS, ORDEM, etc.)

4. Rode a partir da pasta `treinarMarkov/`:

   ```
   cd treinarMarkov
   python preprocessar_nomes.py
   ```

5. O script regrava `data/nomes-markov.json` e gera
   `treinarMarkov/amostras.txt` (preview pra revisão).

A subpasta `names/` e o `amostras.txt` ficam no `.gitignore` —
só o script Python é versionado.

## Crédito de dados

Nomes treinados em
[philipperemy/name-dataset](https://github.com/philipperemy/name-dataset)
(MIT).