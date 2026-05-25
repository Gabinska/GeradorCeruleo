// Lógica pura de redistribuição da tabela de distribuição.
// Regras: soma sempre 100, inteiros, distribui igualmente,
// resto vai pro maior (desempate alfabético).

/**
 * Aplica um novo valor numa fatia, redistribuindo o delta
 * pelas outras fatias.
 *
 * @param {Object} distribuicao - { id: valor }
 * @param {string} targetId
 * @param {number} novoValor
 * @returns {Object} nova distribuição
 */
export function aplicarValor(distribuicao, targetId, novoValor) {
  // Sanitiza entrada
  novoValor = Math.round(Number(novoValor) || 0);
  novoValor = Math.max(0, Math.min(100, novoValor));

  const resultado = { ...distribuicao };
  const valorAtual = resultado[targetId];
  const delta = novoValor - valorAtual;

  if (delta === 0) return resultado;

  resultado[targetId] = novoValor;
  const outrosIds = Object.keys(resultado).filter(id => id !== targetId);

  if (delta > 0) {
    // Precisa TIRAR `delta` das outras fatias
    let restante = delta;
    while (restante > 0) {
      const ativas = outrosIds.filter(id => resultado[id] > 0);
      if (ativas.length === 0) break;

      const n = ativas.length;
      const base = Math.floor(restante / n);
      const resto = restante % n;

      // Ordena por valor desc, desempate alfabético — os maiores
      // recebem +1 do resto.
      const ordenado = [...ativas].sort((a, b) => {
        if (resultado[b] !== resultado[a]) return resultado[b] - resultado[a];
        return a.localeCompare(b);
      });

      let aplicado = 0;
      ordenado.forEach((id, i) => {
        const aTirar = base + (i < resto ? 1 : 0);
        const realmente = Math.min(aTirar, resultado[id]);
        resultado[id] -= realmente;
        aplicado += realmente;
      });

      restante -= aplicado;
      if (aplicado === 0) break; // segurança
    }

    // Se não conseguiu tirar tudo (todas as outras zeraram), reverte
    // o excesso no target — soma fica em 100.
    if (restante > 0) {
      resultado[targetId] -= restante;
    }
  } else {
    // Precisa ADICIONAR |delta| nas outras
    const adicionar = -delta;
    const n = outrosIds.length;
    if (n > 0) {
      const base = Math.floor(adicionar / n);
      const resto = adicionar % n;

      const ordenado = [...outrosIds].sort((a, b) => {
        if (resultado[b] !== resultado[a]) return resultado[b] - resultado[a];
        return a.localeCompare(b);
      });

      ordenado.forEach((id, i) => {
        resultado[id] += base + (i < resto ? 1 : 0);
      });
    }
  }

  return resultado;
}

/** Variação +1 ou -1 a partir do valor atual. */
export function passo(distribuicao, targetId, direcao) {
  const atual = distribuicao[targetId];
  return aplicarValor(distribuicao, targetId, atual + direcao);
}

/** Soma de todos os valores (deve ser sempre 100). */
export function soma(distribuicao) {
  return Object.values(distribuicao).reduce((a, b) => a + b, 0);
}