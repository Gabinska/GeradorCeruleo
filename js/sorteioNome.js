// Motor de sorteio de nomes.
// Lê data/nomes-markov.json (gerado pelo preprocessar_nomes.py),
// implementa Markov de caracteres no browser e expõe gerarNome().

// Cache do modelo carregado. Único fetch por sessão.
let modelo = null;

/**
 * Carrega o JSON de modelos. Idempotente — chamadas repetidas
 * devolvem o cache.
 * @param {string} url
 * @returns {Promise<Object>}
 */
export async function carregarModelo(url = 'data/nomes-markov.json') {
  if (modelo) return modelo;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
  modelo = await res.json();
  return modelo;
}

/**
 * Sorteia uma chave de { chave: peso } respeitando os pesos.
 * Retorna null se todos os pesos forem 0.
 */
function sortearPonderado(pesos) {
  let total = 0;
  for (const peso of Object.values(pesos)) total += peso;
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (const [chave, peso] of Object.entries(pesos)) {
    if (peso <= 0) continue;
    r -= peso;
    if (r <= 0) return chave;
  }
  // Fallback de borda numérica
  return Object.keys(pesos).pop();
}

/**
 * Gera UMA string de letras via Markov de caracteres.
 * @param {Object} tabela  - { ngrama: { proxima_letra: contagem } }
 * @param {number} ordem
 * @param {number} capChars - cap absoluto de comprimento
 * @returns {string}
 */
function gerarViaMarkov(tabela, ordem, capChars = 40) {
  let estado = '^'.repeat(ordem);
  let nome = '';
  for (let i = 0; i < capChars; i++) {
    const opcoes = tabela[estado];
    if (!opcoes) break;
    const prox = sortearPonderado(opcoes);
    if (!prox || prox === '$') break;
    nome += prox;
    estado = (estado + prox).slice(-ordem);
  }
  return nome;
}

/** Capitaliza a primeira letra, restante minúsculo. */
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Gera um nome para um NPC.
 *
 * @param {Object} opts
 * @param {string} opts.provincia  - id da província (ex: 'empodia',
 *                                   'cerulea_norte', 'correntes',
 *                                   'cerulea_sul', 'dakry')
 * @param {string} opts.genero     - 'M' | 'F' | 'N'
 * @param {number} [opts.minLetras=3]
 * @param {number} [opts.maxLetras=13]
 * @param {number} [opts.tentativas=50]
 * @returns {{ nome: string, regiao: string } | null}
 */
export function gerarNome({
  provincia,
  genero,
  minLetras = 3,
  maxLetras = 13,
  tentativas = 50,
}) {
  if (!modelo) {
    throw new Error('Modelo não carregado. Chame carregarModelo() primeiro.');
  }

  const pesosRegioes = modelo.provincias[provincia];
  if (!pesosRegioes) {
    throw new Error(`Província desconhecida: ${provincia}`);
  }

  // Filtra regiões que efetivamente têm modelo carregado
  // (caso alguma região tenha dado vazio no pré-processamento).
  const pesosValidos = {};
  for (const [regiao, peso] of Object.entries(pesosRegioes)) {
    if (modelo.modelos[regiao]) {
      pesosValidos[regiao] = peso;
    }
  }

  const regiao = sortearPonderado(pesosValidos);
  if (!regiao) return null;

  const tabela = modelo.modelos[regiao]?.[genero];
  if (!tabela || Object.keys(tabela).length === 0) return null;

  // Rejection sampling de tamanho.
  let ultimo = '';
  for (let t = 0; t < tentativas; t++) {
    const nome = gerarViaMarkov(tabela, modelo.ordem);
    ultimo = nome;
    if (nome.length >= minLetras && nome.length <= maxLetras) {
      return { nome: capitalize(nome), regiao };
    }
  }
  return ultimo ? { nome: capitalize(ultimo), regiao } : null;
}

/** Lista os ids das províncias disponíveis no modelo. */
export function listarProvincias() {
  if (!modelo) return [];
  return Object.keys(modelo.provincias);
}