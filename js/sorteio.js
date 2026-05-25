// Motor de sorteio de ancestralidade.

/**
 * Sorteia um item de um objeto { id: peso } respeitando os pesos.
 * Itens com peso 0 nunca são sorteados.
 * Retorna o id sorteado, ou null se todos os pesos forem 0.
 *
 * @param {Object} pesos - { id: numero }
 * @returns {string|null}
 */
export function sortearPonderado(pesos) {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (const [id, peso] of Object.entries(pesos)) {
    if (peso <= 0) continue;
    r -= peso;
    if (r <= 0) return id;
  }
  // Fallback de borda numérica
  return Object.keys(pesos).filter(id => pesos[id] > 0).pop();
}

/**
 * Filtra a distribuição para incluir apenas ids marcados.
 * Resultado mantém os pesos originais (a re-normalização
 * acontece automaticamente no sorteador ponderado, que usa
 * a soma do subconjunto).
 *
 * @param {Object} distribuicao - { id: % }
 * @param {string[]} idsMarcados
 * @returns {Object} subconjunto
 */
export function filtrarSubconjunto(distribuicao, idsMarcados) {
  const filtrado = {};
  idsMarcados.forEach(id => {
    if (id in distribuicao) filtrado[id] = distribuicao[id];
  });
  return filtrado;
}

/**
 * Sorteia uma ancestralidade considerando o universo permitido
 * pelos checkboxes e os pesos da distribuição.
 *
 * Se cair em Híbrido, sorteia 2 ancestralidades distintas
 * das marcadas (excluindo Híbrido), respeitando os mesmos pesos.
 *
 * @param {Object} args
 * @param {Object} args.distribuicao   - { id: % } completa
 * @param {string[]} args.idsMarcados  - ids marcados no checkbox
 * @param {string} args.idHibrido      - id da entrada "híbrido"
 * @returns {Object} { tipo: 'puro'|'hibrido', ids: string[] }
 */
export function sortearAncestralidade({ distribuicao, idsMarcados, idHibrido }) {
  const subconjunto = filtrarSubconjunto(distribuicao, idsMarcados);
  const sorteado = sortearPonderado(subconjunto);

  if (sorteado === null) {
    return { tipo: 'puro', ids: [] }; // segurança — UI não deveria permitir
  }

  if (sorteado !== idHibrido) {
    return { tipo: 'puro', ids: [sorteado] };
  }

  // Caiu em Híbrido: sorteia 2 ids distintos do subconjunto
  // excluindo o próprio Híbrido.
  const semHibrido = { ...subconjunto };
  delete semHibrido[idHibrido];

  // Se todos os pesos do pool secundário estão zerados,
  // sorteia uniformemente (peso 1 pra cada).
  const totalPesos = Object.values(semHibrido).reduce((a, b) => a + b, 0);
  const poolEfetivo = totalPesos > 0
    ? semHibrido
    : Object.fromEntries(Object.keys(semHibrido).map(id => [id, 1]));

  const primeiro = sortearPonderado(poolEfetivo);
  if (primeiro === null) {
    return { tipo: 'puro', ids: [] };
  }

  const semPrimeiro = { ...poolEfetivo };
  delete semPrimeiro[primeiro];

  const segundo = sortearPonderado(semPrimeiro);
  if (segundo === null) {
    return { tipo: 'puro', ids: [primeiro] };
  }

  return { tipo: 'hibrido', ids: [primeiro, segundo] };
}