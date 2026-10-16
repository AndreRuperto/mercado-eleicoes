import test from 'node:test';
import assert from 'node:assert/strict';
import { mesesEntre, periodoDoMandato, calcularMandato, MANDATOS } from '../assets/calc.js';
import { lerLinhasSidra, montarDados, separarNome, nivelPorCodigo } from '../scripts/sidra.mjs';

test('mesesEntre atravessa a virada do ano', () => {
  assert.deepEqual(mesesEntre('202211', '202302'), ['202211', '202212', '202301', '202302']);
  assert.equal(mesesEntre('201901', '202212').length, 48);
});

test('periodoDoMandato recorta pelo último mês disponível', () => {
  const [bolsonaro, lula] = MANDATOS;
  assert.equal(periodoDoMandato(bolsonaro, '202609').length, 48);
  assert.equal(periodoDoMandato(lula, '202609').length, 45);
  assert.equal(periodoDoMandato(lula, '202212').length, 0);
});

test('calcularMandato compõe as variações mensais', () => {
  const r = calcularMandato({ 202301: 1, 202302: 1 }, ['202301', '202302']);
  assert.ok(Math.abs(r.acumulado - 2.01) < 1e-9);
  assert.equal(r.indice.length, 3);
  const anual = calcularMandato(Object.fromEntries(mesesEntre('202301', '202412').map((m) => [m, 0.5])), mesesEntre('202301', '202412'));
  assert.ok(Math.abs(anual.anualizado - (Math.pow(1.005, 12) - 1) * 100) < 1e-9);
});

test('calcularMandato devolve null quando falta mês', () => {
  assert.equal(calcularMandato({ 202301: 1 }, ['202301', '202302']), null);
});

test('separarNome e nivelPorCodigo', () => {
  assert.deepEqual(separarNome('1101002.Arroz'), { codigo: '1101002', nome: 'Arroz' });
  assert.deepEqual(separarNome('Índice geral'), { codigo: '', nome: 'Índice geral' });
  assert.equal(nivelPorCodigo('1'), 'grupo');
  assert.equal(nivelPorCodigo('11'), 'subgrupo');
  assert.equal(nivelPorCodigo('1101'), 'item');
  assert.equal(nivelPorCodigo('1101002'), 'subitem');
});

test('lerLinhasSidra e montarDados juntam consultas', () => {
  const cab = {
    NC: 'Nível Territorial (Código)', V: 'Valor',
    D3C: 'Mês (Código)', D3N: 'Mês',
    D4C: 'Geral, grupo, subgrupo, item e subitem (Código)', D4N: 'Geral, grupo, subgrupo, item e subitem',
  };
  const a = lerLinhasSidra([cab,
    { V: '0.32', D3C: '201912', D4C: '7169', D4N: 'Índice geral' },
    { V: '...', D3C: '201912', D4C: '7172', D4N: '1101002.Arroz' },
  ]);
  const b = lerLinhasSidra([cab,
    { V: '0.21', D3C: '202001', D4C: '7169', D4N: 'Índice geral' },
    { V: '1.5', D3C: '202001', D4C: '7172', D4N: '1101002.Arroz (novo nome)' },
  ]);
  const d = montarDados([...a, ...b], { geradoEm: 'x', fontes: [] });
  assert.deepEqual(d.periodos, ['201912', '202001']);
  const geral = d.itens.find((i) => i.id === '7169');
  assert.deepEqual(geral.valores, [0.32, 0.21]);
  assert.equal(geral.nivel, 'geral');
  const arroz = d.itens.find((i) => i.id === '7172');
  assert.deepEqual(arroz.valores, [null, 1.5]);
  assert.equal(arroz.nome, 'Arroz (novo nome)');
  assert.equal(arroz.nivel, 'subitem');
});
