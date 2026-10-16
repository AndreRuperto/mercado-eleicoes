import { MANDATOS, periodoDoMandato, calcularMandato, variacoesDoItem } from './calc.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const $ = (id) => document.getElementById(id);
const estado = { itens: [], selecionado: null, grafico: null, periodosMandato: {} };

function rotuloMes(p) {
  return `${MESES[Number(p.slice(4, 6)) - 1]}/${p.slice(0, 4)}`;
}
function pct(v, sinal = false) {
  if (v === null || v === undefined) return '—';
  const s = fmtPct.format(v);
  return `${sinal && v > 0 ? '+' : ''}${s}%`;
}
function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

async function carregar() {
  let dados;
  try {
    const resp = await fetch('data/ipca.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    dados = await resp.json();
  } catch (erro) {
    const status = $('status');
    status.classList.add('erro');
    status.textContent = 'Os dados ainda não foram gerados. Rode "npm run dados" (ou a GitHub Action "Atualizar dados do IPCA") para baixar o IPCA do IBGE.';
    console.error(erro);
    return;
  }

  const ultimo = dados.periodos.at(-1);
  for (const m of MANDATOS) estado.periodosMandato[m.id] = periodoDoMandato(m, ultimo);

  const grupos = new Map(dados.itens.filter((i) => i.nivel === 'grupo').map((i) => [i.codigo, i.nome]));
  estado.itens = dados.itens.map((item) => {
    const variacoes = variacoesDoItem(item, dados.periodos);
    const r = Object.fromEntries(MANDATOS.map((m) => [m.id, calcularMandato(variacoes, estado.periodosMandato[m.id])]));
    return { ...item, grupo: item.codigo ? grupos.get(item.codigo[0]) : null, resultado: r };
  });

  const mesesLula = estado.periodosMandato.lula.length;
  $('legenda-lula').textContent = `Lula (jan/2023–${rotuloMes(ultimo)}, em curso)`;
  $('atualizacao').textContent =
    `Último mês disponível: ${rotuloMes(ultimo)} (${mesesLula} meses do mandato Lula). ` +
    `Dados baixados em ${new Date(dados.geradoEm).toLocaleDateString('pt-BR')}. Fontes: ${dados.fontes.join('; ')}.`;

  $('status').hidden = true;
  renderResumo();
  for (const id of ['resumo', 'painel-grafico', 'painel-tabela']) $(id).hidden = false;
  for (const id of ['busca', 'nivel', 'metrica', 'ordem']) $(id).addEventListener('input', renderTabela);
  renderTabela();
  selecionar(estado.itens.find((i) => i.nivel === 'geral') ?? estado.itens[0]);
}

function renderResumo() {
  const geral = estado.itens.find((i) => i.nivel === 'geral');
  if (!geral) return;
  $('resumo').innerHTML = MANDATOS.map((m) => {
    const r = geral.resultado[m.id];
    const periodo = estado.periodosMandato[m.id];
    return `
      <article class="cartao">
        <div class="cartao-rotulo"><span class="amostra amostra-${m.id}" aria-hidden="true"></span>${m.nomeCompleto}</div>
        <div class="cartao-valor">${pct(r?.anualizado)} <small style="font-size:1rem;font-weight:500">ao ano</small></div>
        <div class="cartao-detalhe">Inflação (IPCA) acumulada de ${pct(r?.acumulado)} em ${periodo.length} meses
          (${rotuloMes(periodo[0])}–${rotuloMes(periodo.at(-1))})</div>
      </article>`;
  }).join('');
}

function itensFiltrados() {
  const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const nivel = $('nivel').value;
  const metrica = $('metrica').value;
  const ordem = $('ordem').value;
  const valor = (i, id) => i.resultado[id]?.[metrica] ?? null;
  const dif = (i) => (valor(i, 'lula') !== null && valor(i, 'bolsonaro') !== null ? valor(i, 'lula') - valor(i, 'bolsonaro') : null);

  const lista = estado.itens.filter((i) => {
    if (nivel !== 'todos' && i.nivel !== nivel) return false;
    if (!busca) return true;
    const alvo = `${i.nome} ${i.grupo ?? ''}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return alvo.includes(busca);
  });
  const chave = { bolsonaro: (i) => valor(i, 'bolsonaro'), lula: (i) => valor(i, 'lula'), diferenca: dif }[ordem];
  if (chave) {
    lista.sort((a, b) => {
      const va = chave(a), vb = chave(b);
      if (va === null && vb === null) return a.nome.localeCompare(b.nome, 'pt-BR');
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va;
    });
  } else {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  return { lista, valor, dif };
}

function renderTabela() {
  const { lista, valor, dif } = itensFiltrados();
  const corpo = $('linhas');
  corpo.replaceChildren(...lista.map((i) => {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('aria-selected', String(estado.selecionado?.id === i.id));
    const nome = document.createElement('td');
    nome.textContent = i.nome;
    if (i.grupo && i.nivel !== 'grupo') {
      const cat = document.createElement('span');
      cat.className = 'categoria';
      cat.textContent = i.grupo;
      nome.append(cat);
    }
    const celulas = [valor(i, 'bolsonaro'), valor(i, 'lula'), dif(i)].map((v, k) => {
      const td = document.createElement('td');
      td.className = 'num';
      td.textContent = k === 2 ? (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtPct.format(v)}`) : pct(v);
      return td;
    });
    tr.append(nome, ...celulas);
    tr.addEventListener('click', () => selecionar(i));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionar(i); } });
    return tr;
  }));
  $('contagem').textContent = `${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'}. ` +
    ($('metrica').value === 'anualizado' ? 'Valores em % ao ano.' : 'Valores em % acumulado no mandato.');
}

function selecionar(item) {
  if (!item) return;
  estado.selecionado = item;
  renderTabela();
  $('grafico-titulo').textContent = item.nome;
  renderGrafico(item);
  const partes = MANDATOS.map((m) => {
    const r = item.resultado[m.id];
    if (!r) return `${m.nome}: sem série completa`;
    return `${m.nome}: <strong>${fmtReal.format(r.indice.at(-1))}</strong> (${pct(r.acumulado, true)} em ${r.meses} meses, ${pct(r.anualizado, true)} ao ano)`;
  });
  $('grafico-calculadora').innerHTML = `O que custava R$ 100,00 no início do mandato passou a custar — ${partes.join(' · ')}.`;
}

function renderGrafico(item) {
  if (typeof Chart === 'undefined') {
    $('grafico-legenda-texto').textContent = 'Não foi possível carregar a biblioteca de gráficos.';
    return;
  }
  const maxMeses = Math.max(...MANDATOS.map((m) => estado.periodosMandato[m.id].length));
  const labels = Array.from({ length: maxMeses + 1 }, (_, k) => k);
  const series = { bolsonaro: '--serie-bolsonaro', lula: '--serie-lula' };
  const datasets = MANDATOS.map((m) => ({
    label: m.nome,
    data: item.resultado[m.id]?.indice ?? [],
    borderColor: cor(series[m.id]),
    backgroundColor: cor(series[m.id]),
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 2,
    pointHoverBorderColor: cor('--superficie'),
    tension: 0,
  }));
  const texto2 = cor('--texto-2');
  const grade = cor('--grade');

  if (estado.grafico) estado.grafico.destroy();
  estado.grafico = new Chart($('grafico'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => `Mês ${ctx[0].label} do mandato`,
            label: (ctx) => {
              const m = MANDATOS[ctx.datasetIndex];
              const k = Number(ctx.label);
              const periodo = k === 0 ? 'início' : rotuloMes(estado.periodosMandato[m.id][k - 1]);
              return ` ${m.nome} (${periodo}): ${fmtReal.format(ctx.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Meses desde o início do mandato', color: texto2 },
          ticks: { color: texto2, callback: (v) => (v % 6 === 0 ? v : ''), autoSkip: false, maxRotation: 0 },
          grid: { display: false },
          border: { color: grade },
        },
        y: {
          ticks: { color: texto2, callback: (v) => fmtReal.format(v) },
          grid: { color: grade },
          border: { display: false },
        },
      },
    },
  });
}

window.addEventListener('DOMContentLoaded', carregar);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (estado.selecionado) renderGrafico(estado.selecionado);
});
