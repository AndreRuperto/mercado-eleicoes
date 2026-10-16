// Baixa a variação mensal do IPCA (por grupo, subgrupo, item e subitem) da API
// SIDRA do IBGE e grava data/ipca.json.
//
// Tabelas usadas:
//   1419 - IPCA, jan/2012 a dez/2019 (usamos só 2019)
//   7060 - IPCA, a partir de jan/2020
// Variável 63 = variação mensal (%). Classificação 315 = geral, grupo, subgrupo, item e subitem.
//
// Uso: node scripts/atualizar-dados.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { lerLinhasSidra, montarDados } from './sidra.mjs';

const INICIO = '201901';
const SAIDA = new URL('../data/ipca.json', import.meta.url);
const MESES_POR_CONSULTA = 12; // mantém cada consulta bem abaixo do limite de 50 mil valores da SIDRA

const TABELAS = [
  { tabela: '1419', ate: '201912' },
  { tabela: '7060', ate: null },
];

async function obterJson(url, tentativas = 4) {
  for (let i = 0; ; i++) {
    try {
      const resp = await fetch(url, { headers: { accept: 'application/json' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}: ${(await resp.text()).slice(0, 200)}`);
      return await resp.json();
    } catch (erro) {
      if (i + 1 >= tentativas) throw erro;
      const espera = 2000 * 2 ** i;
      console.warn(`Falha (${erro.message}); nova tentativa em ${espera / 1000}s`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

async function periodosDaTabela(tabela) {
  const lista = await obterJson(`https://servicodados.ibge.gov.br/api/v3/agregados/${tabela}/periodos`);
  return lista.map((p) => String(p.id)).sort();
}

async function main() {
  const registros = [];
  for (const { tabela, ate } of TABELAS) {
    const periodos = (await periodosDaTabela(tabela)).filter((p) => p >= INICIO && (!ate || p <= ate));
    for (let i = 0; i < periodos.length; i += MESES_POR_CONSULTA) {
      const lote = periodos.slice(i, i + MESES_POR_CONSULTA);
      const url = `https://apisidra.ibge.gov.br/values/t/${tabela}/n1/all/v/63/p/${lote.join(',')}/c315/all`;
      console.log(`Tabela ${tabela}: ${lote[0]}–${lote[lote.length - 1]}`);
      registros.push(...lerLinhasSidra(await obterJson(url)));
    }
  }
  if (!registros.length) throw new Error('Nenhum dado retornado pela SIDRA.');

  const dados = montarDados(registros, {
    geradoEm: new Date().toISOString(),
    fontes: [
      'IBGE – IPCA, Tabela 1419 (jan/2012–dez/2019), variação mensal',
      'IBGE – IPCA, Tabela 7060 (a partir de jan/2020), variação mensal',
    ],
  });
  const anterior = await readFile(SAIDA, 'utf8').then(JSON.parse, () => null);
  if (anterior && JSON.stringify([anterior.periodos, anterior.itens]) === JSON.stringify([dados.periodos, dados.itens])) {
    console.log('Dados iguais aos já salvos; nada a atualizar.');
    return;
  }
  await mkdir(new URL('.', SAIDA), { recursive: true });
  await writeFile(SAIDA, JSON.stringify(dados) + '\n');
  console.log(`OK: ${dados.itens.length} itens, ${dados.periodos[0]}–${dados.periodos.at(-1)} → data/ipca.json`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
