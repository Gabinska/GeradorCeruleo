import { aplicarValor, passo } from './distribuicao.js';
import { sortearAncestralidade } from './sorteio.js';
import {
  sortearFaixaEtaria, sortearIdade,
  sortearAltura, sortearPeso,
  sortearCor, sortearTracos
} from './sorteioFeatures.js';
import { carregarModelo, gerarNome, listarProvincias } from './sorteioNome.js';

const CAMPOS = ['nome', 'ancestralidade', 'genero', 'idade', 'altura', 'peso', 'olhos', 'cabelo', 'corpo', 'outros'];

const NOMES_GENERO = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  neutro: 'Neutro'
};

const NOMES_FAIXA = {
  crianca: 'criança',
  adulto: 'adulto',
  maduro: 'maduro',
  idoso: 'idoso'
};

const GENERO_PARA_MARKOV = {
  masculino: 'M',
  feminino: 'F',
  neutro: 'N'
};

const estado = {
  ancestralidades: [],
  tracosDefinicoes: {},
  provincias: [],
  distribuicaoAtual: {},
  presetAtivo: null,
  personalizado: false,
  travados: Object.fromEntries(CAMPOS.map(c => [c, false])),
  ultimoNPC: null,
  provinciasNomes: []
};

// ===== Inicialização =====

(async function init() {
  const btnGerar = document.getElementById('btn-gerar');
  btnGerar.disabled = true;
  btnGerar.textContent = 'Carregando…';

  const dadosAnc = await carregarJSON('data/ancestralidades.json');
  estado.ancestralidades = dadosAnc.ancestralidades;
  estado.tracosDefinicoes = dadosAnc.tracos_definicoes;

  estado.provincias = (await carregarJSON('data/provincias.json')).provincias;
  estado.distribuicaoAtual = distribuirIgualmente(estado.ancestralidades);

  // Carrega o modelo Markov de nomes (11 MB, pode demorar 1–3s).
  await carregarModelo('data/nomes-markov.json');
  estado.provinciasNomes = listarProvincias();

  renderizarAncestralidades();
  renderizarDistribuicao();
  renderizarSelectProvincia();
  configurarTodosNenhum();
  configurarValidacaoGerar();
  configurarCadeados();
  configurarTamanhoNome();
  configurarTema();
  atualizarEstadoHibrido();

  btnGerar.textContent = 'Gerar';
  atualizarBotaoGerar();
  btnGerar.addEventListener('click', gerarNPC);
})();

function distribuirIgualmente(ancestralidades) {
  const n = ancestralidades.length;
  const base = Math.floor(100 / n);
  const resto = 100 % n;
  const ordenadas = [...ancestralidades].sort((a, b) => a.id.localeCompare(b.id));
  const dist = {};
  ordenadas.forEach((a, i) => { dist[a.id] = base + (i < resto ? 1 : 0); });
  return dist;
}

async function carregarJSON(caminho) {
  const resp = await fetch(caminho);
  if (!resp.ok) throw new Error(`Falha ao carregar ${caminho}`);
  return resp.json();
}

// ===== Cadeados =====

function configurarCadeados() {
  document.querySelectorAll('button.cadeado').forEach(btn => {
    btn.addEventListener('click', () => {
      const campo = btn.dataset.campo;
      estado.travados[campo] = !estado.travados[campo];
      btn.textContent = estado.travados[campo] ? '🔒' : '🔓';
      btn.classList.toggle('travado', estado.travados[campo]);
    });
  });
}

// ===== Renderização da UI de opções =====

function renderizarAncestralidades() {
  const cont = document.getElementById('lista-ancestralidades');
  cont.innerHTML = '';
  estado.ancestralidades.forEach(anc => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = anc.id;
    cb.dataset.ancestralidade = anc.id;
    cb.checked = true;
    if (anc.is_hibrido) cb.dataset.hibrido = 'true';
    label.appendChild(cb);
    const span = document.createElement('span');
    span.className = 'nome-anc';
    span.textContent = ' ' + anc.nome;
    label.appendChild(span);
    cont.appendChild(label);
    cb.addEventListener('change', atualizarEstadoHibrido);
  });

  const labelTodos = document.createElement('label');
  labelTodos.className = 'todos-nenhum';
  const cbTodos = document.createElement('input');
  cbTodos.type = 'checkbox';
  cbTodos.dataset.todos = 'true';
  cbTodos.checked = true;
  labelTodos.appendChild(cbTodos);
  labelTodos.append(' Todos/Nenhum');
  cont.appendChild(labelTodos);
}

function renderizarDistribuicao() {
  const tbody = document.querySelector('#tabela-distribuicao tbody');
  tbody.innerHTML = '';

  estado.ancestralidades.forEach(anc => {
    const tr = document.createElement('tr');
    tr.dataset.ancestralidade = anc.id;

    const tdNome = document.createElement('td');
    tdNome.className = 'nome-anc';
    tdNome.textContent = anc.nome;

    const tdMenos = document.createElement('td');
    tdMenos.className = 'celula-botao';
    const btnMenos = document.createElement('button');
    btnMenos.className = 'btn-passo';
    btnMenos.textContent = '−';
    btnMenos.addEventListener('click', () => aplicarPasso(anc.id, -1));
    tdMenos.appendChild(btnMenos);

    const tdInput = document.createElement('td');
    tdInput.className = 'celula-input';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'input-percentual';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = estado.distribuicaoAtual[anc.id];
    input.addEventListener('change', () => aplicarInput(anc.id, input.value));
    input.addEventListener('blur', () => { input.value = estado.distribuicaoAtual[anc.id]; });
    tdInput.appendChild(input);

    const tdMais = document.createElement('td');
    tdMais.className = 'celula-botao';
    const btnMais = document.createElement('button');
    btnMais.className = 'btn-passo';
    btnMais.textContent = '+';
    btnMais.addEventListener('click', () => aplicarPasso(anc.id, +1));
    tdMais.appendChild(btnMais);

    tr.append(tdNome, tdMenos, tdInput, tdMais);
    tbody.appendChild(tr);
  });
}

function sincronizarInputs() {
  document.querySelectorAll('#tabela-distribuicao tr[data-ancestralidade]').forEach(tr => {
    const id = tr.dataset.ancestralidade;
    tr.querySelector('input').value = estado.distribuicaoAtual[id];
  });
}

function aplicarPasso(id, direcao) {
  estado.distribuicaoAtual = passo(estado.distribuicaoAtual, id, direcao);
  marcarPersonalizado();
  sincronizarInputs();
}

function aplicarInput(id, valor) {
  estado.distribuicaoAtual = aplicarValor(estado.distribuicaoAtual, id, valor);
  marcarPersonalizado();
  sincronizarInputs();
}

function marcarPersonalizado() {
  if (estado.presetAtivo !== null) {
    estado.personalizado = true;
    document.getElementById('indicador-personalizado').hidden = false;
  }
}

function atualizarEstadoHibrido() {
  const checks = document.querySelectorAll('#lista-ancestralidades input[type="checkbox"][data-ancestralidade]');
  const naoHibridoMarcados = [...checks].filter(c => c.checked && c.dataset.hibrido !== 'true').length;
  const cbHibrido = document.querySelector('input[data-hibrido="true"]');
  if (!cbHibrido) return;

  if (naoHibridoMarcados >= 2) {
    cbHibrido.disabled = false;
    cbHibrido.closest('label').removeAttribute('title');
  } else {
    if (cbHibrido.checked) cbHibrido.checked = false;
    cbHibrido.disabled = true;
    cbHibrido.closest('label').setAttribute(
      'title',
      'Marque pelo menos 2 outras ancestralidades para habilitar Híbrido.'
    );
  }
}

function configurarTodosNenhum() {
  document.querySelectorAll('input[data-todos]').forEach(cbTodos => {
    const fieldset = cbTodos.closest('fieldset');
    cbTodos.addEventListener('change', () => {
      const irmaos = filhosDe(fieldset);
      irmaos.forEach(cb => { cb.checked = cbTodos.checked; });
      atualizarEstadoHibrido();
      atualizarBotaoGerar();
    });
    filhosDe(fieldset).forEach(filho => {
      filho.addEventListener('change', () => {
        const ativos = filhosDe(fieldset).filter(c => !c.disabled);
        const todosMarcados = ativos.length > 0 && ativos.every(c => c.checked);
        cbTodos.checked = todosMarcados;
      });
    });
  });
}

function filhosDe(fieldset) {
  return [...fieldset.querySelectorAll(
    'input[type="checkbox"]:not([data-todos]):not([data-hibrido])'
  )];
}

function configurarValidacaoGerar() {
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', atualizarBotaoGerar);
  });
}

function atualizarBotaoGerar() {
  const motivos = [];

  const generos = [...document.querySelectorAll('#lista-genero input[type="checkbox"]:not([data-todos])')].filter(c => c.checked);
  if (generos.length === 0) motivos.push('• Marque ao menos um gênero.');

  const faixas = [...document.querySelectorAll('#lista-faixa-etaria input[type="checkbox"]:not([data-todos])')].filter(c => c.checked);
  if (faixas.length === 0) motivos.push('• Marque ao menos uma faixa etária.');

  const ancestralidades = [...document.querySelectorAll('#lista-ancestralidades input[type="checkbox"][data-ancestralidade]')].filter(c => c.checked);
  if (ancestralidades.length === 0) motivos.push('• Marque ao menos uma ancestralidade.');

  const btn = document.getElementById('btn-gerar');
  if (motivos.length === 0) {
    btn.disabled = false;
    btn.removeAttribute('title');
  } else {
    btn.disabled = true;
    btn.setAttribute('title', motivos.join('\n'));
  }
}

// ===== Predefinições =====

function renderizarSelectProvincia() {
  const sel = document.getElementById('select-provincia');
  estado.provincias.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nome;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => aplicarPreset(sel.value));
}

function aplicarPreset(idProvincia) {
  if (!idProvincia) { estado.presetAtivo = null; return; }
  const prov = estado.provincias.find(p => p.id === idProvincia);
  if (!prov) return;
  estado.distribuicaoAtual = { ...prov.distribuicao };
  estado.presetAtivo = idProvincia;
  estado.personalizado = false;
  document.getElementById('indicador-personalizado').hidden = true;
  sincronizarInputs();
}

// ===== Helpers de leitura da UI =====

function ancestralidadesMarcadas() {
  return [...document.querySelectorAll('#lista-ancestralidades input[type="checkbox"][data-ancestralidade]')]
    .filter(c => c.checked && !c.disabled).map(c => c.value);
}

function faixasEtariasMarcadas() {
  return [...document.querySelectorAll('#lista-faixa-etaria input[type="checkbox"]:not([data-todos])')]
    .filter(c => c.checked).map(c => c.value);
}

function generosMarcados() {
  return [...document.querySelectorAll('#lista-genero input[type="checkbox"]:not([data-todos])')]
    .filter(c => c.checked).map(c => c.value);
}

function idHibrido() {
  const cb = document.querySelector('input[data-hibrido="true"]');
  return cb ? cb.value : null;
}

function ancestralidadePorId(id) {
  return estado.ancestralidades.find(a => a.id === id);
}

function sortearGenero() {
  const marcados = generosMarcados();
  if (marcados.length === 0) return null;
  return marcados[Math.floor(Math.random() * marcados.length)];
}

function lerTamanhoNome() {
  const minRaw = parseInt(document.getElementById('input-min-letras').value, 10);
  const maxRaw = parseInt(document.getElementById('input-max-letras').value, 10);
  const min = clampTamanho(minRaw, 3);
  const max = clampTamanho(maxRaw, 12);
  return { min, max: Math.max(min, max) };
}

// ===== Tema (claro/escuro) =====

function configurarTema() {
  const btn = document.getElementById('btn-tema');
  if (!btn) return;
  atualizarIconeTema();
  btn.addEventListener('click', () => {
    const atual = document.documentElement.dataset.tema;
    const novo = atual === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('tema-ceruleo', novo); } catch (e) {}
    atualizarIconeTema();
  });
}

function atualizarIconeTema() {
  const btn = document.getElementById('btn-tema');
  if (!btn) return;
  const tema = document.documentElement.dataset.tema;
  btn.setAttribute('aria-label',
    tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
}

// ===== Bloco Tamanho do Nome =====

const TAMANHO_MIN_ABS = 3;
const TAMANHO_MAX_ABS = 12;

function clampTamanho(valor, fallback) {
  if (!Number.isFinite(valor)) valor = fallback;
  return Math.max(TAMANHO_MIN_ABS, Math.min(TAMANHO_MAX_ABS, valor));
}

function configurarTamanhoNome() {
  const minEl = document.getElementById('input-min-letras');
  const maxEl = document.getElementById('input-max-letras');

  document.querySelectorAll('button.btn-passo[data-tamanho]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qual = btn.dataset.tamanho;
      const direcao = parseInt(btn.dataset.direcao, 10);
      ajustarTamanho(qual, direcao);
    });
  });

  minEl.addEventListener('change', () => normalizarTamanho('min'));
  maxEl.addEventListener('change', () => normalizarTamanho('max'));
  minEl.addEventListener('blur', () => normalizarTamanho('min'));
  maxEl.addEventListener('blur', () => normalizarTamanho('max'));
}

function ajustarTamanho(qual, direcao) {
  const minEl = document.getElementById('input-min-letras');
  const maxEl = document.getElementById('input-max-letras');
  let minV = clampTamanho(parseInt(minEl.value, 10), 3);
  let maxV = clampTamanho(parseInt(maxEl.value, 10), 12);

  if (qual === 'min') {
    minV = clampTamanho(minV + direcao, 3);
    if (minV > maxV) maxV = minV;
  } else {
    maxV = clampTamanho(maxV + direcao, 12);
    if (maxV < minV) minV = maxV;
  }

  minEl.value = minV;
  maxEl.value = maxV;
}

function normalizarTamanho(editado) {
  // editado: 'min' ou 'max' — qual foi alterado por último.
  // Clampa os dois nos limites absolutos e ajusta o OUTRO se cruzar.
  const minEl = document.getElementById('input-min-letras');
  const maxEl = document.getElementById('input-max-letras');
  let minV = clampTamanho(parseInt(minEl.value, 10), 3);
  let maxV = clampTamanho(parseInt(maxEl.value, 10), 12);

  if (minV > maxV) {
    if (editado === 'min') maxV = minV;
    else minV = maxV;
  }

  minEl.value = minV;
  maxEl.value = maxV;
}

function escolherProvinciaParaNome() {
  // Se há província selecionada no preset, usa ela.
  // Caso contrário, sorteia uma aleatória entre as disponíveis no modelo.
  if (estado.presetAtivo && estado.provinciasNomes.includes(estado.presetAtivo)) {
    return estado.presetAtivo;
  }
  const pool = estado.provinciasNomes;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function gerarNomeNPC(genero) {
  const provincia = escolherProvinciaParaNome();
  if (!provincia) return '—';
  const { min, max } = lerTamanhoNome();
  const generoMarkov = GENERO_PARA_MARKOV[genero] || 'N';
  const resultado = gerarNome({
    provincia,
    genero: generoMarkov,
    minLetras: min,
    maxLetras: max
  });
  return resultado ? resultado.nome : '—';
}

// ===== Geração de NPC =====

function gerarFeaturesParaAncestralidade(anc, faixa) {
  const idade = sortearIdade(anc, faixa);
  const altura = sortearAltura(anc, faixa);
  const peso = sortearPeso(anc, faixa);
  const corCorpo = sortearCor(anc.cor_corpo);
  const corOlhos = sortearCor(anc.cor_olhos);
  const corCabelo = sortearCor(anc.cor_cabelo);
  const tracos = sortearTracos(anc, estado.tracosDefinicoes, corCorpo);
  return { idade, altura, peso, corCorpo, corOlhos, corCabelo, tracos };
}

function gerarNPC() {
  const trav = estado.travados;
  const anterior = estado.ultimoNPC;

  // 1. Ancestralidade
  let resultadoAnc;
  if (trav.ancestralidade && anterior) {
    resultadoAnc = anterior.ancestralidade;
  } else {
    resultadoAnc = sortearAncestralidade({
      distribuicao: estado.distribuicaoAtual,
      idsMarcados: ancestralidadesMarcadas(),
      idHibrido: idHibrido()
    });
    if (!resultadoAnc.ids || resultadoAnc.ids.length === 0) return;
  }

  // 2. Gênero
  const genero = (trav.genero && anterior) ? anterior.genero : sortearGenero();

  // 3. Faixa etária
  const faixa = (trav.idade && anterior) ? anterior.faixa : sortearFaixaEtaria(faixasEtariasMarcadas());

  // 4. Features
  let novas;
  if (resultadoAnc.tipo === 'puro') {
    const anc = ancestralidadePorId(resultadoAnc.ids[0]);
    novas = gerarFeaturesParaAncestralidade(anc, faixa);
  } else {
    const anc1 = ancestralidadePorId(resultadoAnc.ids[0]);
    const anc2 = ancestralidadePorId(resultadoAnc.ids[1]);
    const escolher = () => Math.random() < 0.5 ? anc1 : anc2;
    const ancPorte = escolher();
    const fPorte = gerarFeaturesParaAncestralidade(ancPorte, faixa);
    const fOlhos = gerarFeaturesParaAncestralidade(escolher(), faixa);
    const fCabelo = gerarFeaturesParaAncestralidade(escolher(), faixa);
    const fCorpo = gerarFeaturesParaAncestralidade(escolher(), faixa);
    const fTracos = gerarFeaturesParaAncestralidade(escolher(), faixa);
    novas = {
      idade: fPorte.idade, altura: fPorte.altura, peso: fPorte.peso,
      corOlhos: fOlhos.corOlhos, corCabelo: fCabelo.corCabelo,
      corCorpo: fCorpo.corCorpo, tracos: fTracos.tracos
    };
  }

  // 5. Aplica travamentos sobre as features
  const idade = (trav.idade && anterior) ? anterior.idade : novas.idade;
  const altura = (trav.altura && anterior) ? anterior.altura : novas.altura;
  const peso = (trav.peso && anterior) ? anterior.peso : novas.peso;
  const corOlhos = (trav.olhos && anterior) ? anterior.corOlhos : novas.corOlhos;
  const corCabelo = (trav.cabelo && anterior) ? anterior.corCabelo : novas.corCabelo;
  const corCorpo = (trav.corpo && anterior) ? anterior.corCorpo : novas.corCorpo;
  const tracos = (trav.outros && anterior) ? anterior.tracos : novas.tracos;
  const nome = (trav.nome && anterior) ? anterior.nome : gerarNomeNPC(genero);

  // 6. Guarda estado completo
  estado.ultimoNPC = {
    ancestralidade: resultadoAnc,
    genero, faixa, idade, altura, peso,
    corOlhos, corCabelo, corCorpo, tracos, nome
  };

  // 7. Atualiza UI
  const saida = {
    nome,
    ancestralidade: formatarAncestralidade(resultadoAnc),
    genero: genero ? NOMES_GENERO[genero] : '—',
    idade: `${idade} anos (${NOMES_FAIXA[faixa]})`,
    altura: `${altura.toFixed(2).replace('.', ',')} m`,
    peso: `${Math.round(peso)} kg`,
    olhos: corOlhos || '—',
    cabelo: corCabelo === 'não' ? '—' : (corCabelo || '—'),
    corpo: corCorpo || '—',
    outros: formatarTracos(tracos)
  };

  Object.entries(saida).forEach(([campo, valor]) => {
    const el = document.querySelector(`[data-campo="${campo}"]`);
    if (el) el.textContent = valor;
  });
}

function formatarAncestralidade(resultado) {
  if (!resultado.ids || resultado.ids.length === 0) return '—';
  if (resultado.tipo === 'puro') return ancestralidadePorId(resultado.ids[0]).nome;
  const nomes = resultado.ids.map(id => ancestralidadePorId(id).nome).sort((a, b) => a.localeCompare(b));
  return `Híbrido (${nomes.join(' + ')})`;
}

function formatarTracos(tracos) {
  if (!tracos || tracos.length === 0) return '—';
  const nomesTracos = {
    chifres: 'Chifres', cauda: 'Cauda', asas: 'Asas',
    casco: 'Casco', antenas: 'Antenas'
  };
  return tracos.map(t => {
    if (t.traco === 'ciclope') return t.formato;
    const nome = nomesTracos[t.traco] || t.traco;
    const detalhes = [t.formato, t.cor].filter(Boolean).join(', ');
    return detalhes ? `${nome}: ${detalhes}` : nome;
  }).join('; ');
}