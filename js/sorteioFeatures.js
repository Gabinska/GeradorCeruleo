// Sorteio das features físicas e demográficas de NPC.
// Funções puras, testáveis isoladas.

// ===== Utilitários =====

function sorteioUniforme(min, max) {
  return Math.random() * (max - min) + min;
}

function sorteioInteiro(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sorteioElemento(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Box-Muller para distribuição normal padrão
function normalAleatorio() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function sorteioNormal(min, max) {
  const media = (min + max) / 2;
  const desvio = (max - min) / 6; // 99.7% cai entre min e max
  let valor = media + normalAleatorio() * desvio;
  return Math.max(min, Math.min(max, valor));
}

// ===== Sorteios principais =====

export function sortearFaixaEtaria(faixasMarcadas) {
  return sorteioElemento(faixasMarcadas);
}

export function sortearIdade(ancestralidade, faixa) {
  const [min, max] = ancestralidade.faixa_etaria[faixa];
  return sorteioInteiro(min, max);
}

export function sortearAltura(ancestralidade, faixa) {
  const [min, max] = ancestralidade.altura;
  const mult = ancestralidade.mult_altura[faixa];
  const base = sorteioNormal(min, max);
  return base * mult;
}

export function sortearPeso(ancestralidade, faixa) {
  const [min, max] = ancestralidade.peso;
  const mult = ancestralidade.mult_peso[faixa];
  const base = sorteioNormal(min, max);
  return base * mult;
}

export function sortearCor(lista) {
  if (!lista || lista.length === 0) return null;
  return sorteioElemento(lista);
}

/**
 * Sorteia os traços ativos do NPC.
 * Retorna lista de objetos { traco, cor?, formato? }.
 *
 * @param {Object} ancestralidade
 * @param {Object} tracosDefinicoes - tracos_definicoes do JSON
 * @param {string} corCorpoSorteada - usada para cauda/antenas/chifres-drakona
 */
export function sortearTracos(ancestralidade, tracosDefinicoes, corCorpoSorteada) {
  const resultado = [];

  for (const [nomeTraco, probabilidade] of Object.entries(ancestralidade.tracos)) {
    if (probabilidade <= 0) continue;
    if (Math.random() >= probabilidade) continue;

    const def = tracosDefinicoes[nomeTraco];
    const item = { traco: nomeTraco };

    if (def.tem_cor) {
      if (def.cor_herda_corpo) {
        item.cor = corCorpoSorteada;
      } else if (def.cores && def.cores.length > 0) {
        item.cor = sorteioElemento(def.cores);
      }
    }

    if (def.formatos && def.formatos.length > 0) {
      item.formato = sorteioElemento(def.formatos);
    }

    resultado.push(item);
  }

  // Exceção drakona: chifres usam cor do corpo
  if (ancestralidade.chifres_cor_corpo) {
    const chifres = resultado.find(t => t.traco === 'chifres');
    if (chifres) chifres.cor = corCorpoSorteada;
  }

  return resultado;
}