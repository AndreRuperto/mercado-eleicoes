# Preços Reais Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar preços reais (em R$) por item ao site, buscando automaticamente de ANP (combustíveis), CONAB (alimentos básicos) e CEAGESP (hortifrutti), com cobertura nacional e por estado quando disponível.

**Architecture:** Um novo script `atualizar-precos.mjs` busca dados de 3 fontes e grava `data/precos.json`. O site carrega os dois JSONs (`ipca.json` + `precos.json`) e cruza pelo ID SIDRA do item para exibir preço atual, histórico mensal e média por mandato. Itens sem preço real continuam funcionando como hoje.

**Tech Stack:** Node 20+ (fetch nativo), módulos ES, Chart.js (já presente), node:test para testes.

---

## Estrutura de arquivos

```
scripts/
  atualizar-precos.mjs      ← entry point (novo)
  fontes/
    anp.mjs                 ← parser ANP (novo)
    conab.mjs               ← parser CONAB (novo)
    ceagesp.mjs             ← parser CEAGESP (novo)
  mapeamento.mjs            ← IBGE ID → fonte+código (novo)
data/
  precos.json               ← saída gerada (novo)
test/
  precos.test.mjs           ← testes dos parsers (novo)
```

## Formato de `precos.json`

```json
{
  "geradoEm": "2026-10-16T...",
  "fontes": { "anp": "ok", "conab": "ok", "ceagesp": "erro: timeout" },
  "itens": {
    "7188": {
      "nome": "Gasolina",
      "unidade": "litro",
      "nacional": { "201901": 4.12, "201902": 4.18, "202609": 6.23 },
      "estados": {
        "SP": { "201901": 4.05, "202609": 6.10 },
        "RJ": { "201901": 4.20, "202609": 6.45 }
      }
    }
  }
}
```

A chave de cada item é o ID SIDRA do item no `ipca.json` (ex: `"7188"` para Gasolina).

---

## Task 1: Explorar APIs e criar mapeamento

**Files:**
- Create: `scripts/mapeamento.mjs`
- Create: `scripts/fontes/anp.mjs` (stub)
- Create: `scripts/fontes/conab.mjs` (stub)
- Create: `scripts/fontes/ceagesp.mjs` (stub)

**Step 1: Explorar ANP**

Acessar manualmente para entender o formato:
```
https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos
```

Baixar um CSV de exemplo e identificar colunas. Espera-se colunas como:
`Regiao - Sigla`, `Estado - Sigla`, `Municipio`, `Produto`, `Data da Coleta`, `Preço Médio Revenda`

**Step 2: Explorar CONAB**

```
https://portaldeinformacoes.conab.gov.br/index.php/charts/graficoOleoVegetalSerieHistorica
```

CONAB tem API JSON em:
```
https://portaldeinformacoes.conab.gov.br/index.php/api/produto/consultaPrecoMedioMensalProdutoEstado
```

Verificar parâmetros e formato de retorno.

**Step 3: Explorar CEAGESP**

```
http://www.ceagesp.gov.br/entrepostos/servicos/cotacoes/
```

CEAGESP publica planilhas Excel/CSV mensais. Verificar se há endpoint de API ou apenas download de arquivo.

**Step 4: Criar mapeamento.mjs**

Com base na exploração, criar o arquivo de mapeamento. Exemplo de estrutura:

```js
// scripts/mapeamento.mjs
// id: ID SIDRA do item em ipca.json
// Descobrir IDs rodando: node -e "import('./scripts/sidra.mjs').then(...)" ou inspecionando data/ipca.json

export const MAPEAMENTO = [
  // ANP - combustíveis
  {
    id: '7188',           // verificar ID real em data/ipca.json
    nome: 'Gasolina',
    fonte: 'anp',
    unidade: 'litro',
    codigoFonte: 'GASOLINA COMUM',
  },
  {
    id: '7190',           // verificar ID real
    nome: 'Etanol hidratado',
    fonte: 'anp',
    unidade: 'litro',
    codigoFonte: 'ETANOL HIDRATADO',
  },
  {
    id: '7191',           // verificar ID real
    nome: 'Óleo diesel',
    fonte: 'anp',
    unidade: 'litro',
    codigoFonte: 'ÓLEO DIESEL',
  },
  // CONAB - alimentos básicos
  {
    id: '7393',           // verificar ID real
    nome: 'Arroz',
    fonte: 'conab',
    unidade: 'kg',
    codigoFonte: 'arroz',
  },
  {
    id: '7394',           // verificar ID real
    nome: 'Feijão-carioca',
    fonte: 'conab',
    unidade: 'kg',
    codigoFonte: 'feijao_carioca',
  },
  // CEAGESP - hortifrutti
  {
    id: '7403',           // verificar ID real
    nome: 'Morango',
    fonte: 'ceagesp',
    unidade: 'kg',
    codigoFonte: 'MORANGO',
  },
  {
    id: '7404',           // verificar ID real
    nome: 'Limão',
    fonte: 'ceagesp',
    unidade: 'kg',
    codigoFonte: 'LIMAO',
  },
  {
    id: '7405',           // verificar ID real
    nome: 'Cenoura',
    fonte: 'ceagesp',
    unidade: 'kg',
    codigoFonte: 'CENOURA',
  },
];
```

**Importante:** Verificar IDs reais inspecionando `data/ipca.json`:
```bash
node -e "
import('./data/ipca.json', { assert: { type: 'json' } }).then(d =>
  d.default.itens
    .filter(i => ['Gasolina','Arroz','Morango','Limão','Cenoura','Etanol','Óleo diesel','Feijão'].some(n => i.nome.includes(n)))
    .forEach(i => console.log(i.id, i.nome))
)
"
```

**Step 5: Commit**
```bash
git add scripts/mapeamento.mjs
git commit -m "feat: adiciona mapeamento IBGE→fontes de preço"
```

---

## Task 2: Parser ANP

**Files:**
- Modify: `scripts/fontes/anp.mjs`
- Modify: `test/precos.test.mjs`

A ANP distribui CSVs semanais com preços por posto. Precisamos agregar para obter média mensal por estado e nacional.

**Step 1: Escrever teste com fixture**

Criar arquivo de fixture com 5-10 linhas reais do CSV da ANP:
```
test/fixtures/anp-amostra.csv
```

Conteúdo exemplo (ajustar colunas conforme CSV real):
```csv
Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ da Revenda;Nome da Rua;Numero;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira
SE;SP;SAO PAULO;Auto Posto X;00.000.000/0001-00;Rua A;100;;Centro;01001-000;GASOLINA COMUM;01/02/2026;6.09;5.50;R$ / litro;BRANCA
SE;RJ;RIO DE JANEIRO;Auto Posto Y;11.111.111/0001-11;Av B;200;;Centro;20040-020;GASOLINA COMUM;01/02/2026;6.45;5.80;R$ / litro;BRANCA
```

Escrever teste em `test/precos.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsearCsvAnp, agregarMensal } from '../scripts/fontes/anp.mjs';

test('parsearCsvAnp extrai produto, estado, data e preço', async () => {
  const csv = await readFile(new URL('./fixtures/anp-amostra.csv', import.meta.url), 'utf8');
  const registros = parsearCsvAnp(csv, 'GASOLINA COMUM');
  assert.ok(registros.length >= 1);
  assert.ok(registros[0].estado);          // 'SP'
  assert.ok(registros[0].periodo);         // 'AAAAMM'
  assert.ok(typeof registros[0].preco === 'number');
});

test('agregarMensal calcula média por estado e nacional', () => {
  const registros = [
    { estado: 'SP', periodo: '202602', preco: 6.09 },
    { estado: 'SP', periodo: '202602', preco: 6.11 },
    { estado: 'RJ', periodo: '202602', preco: 6.45 },
  ];
  const resultado = agregarMensal(registros);
  assert.ok(Math.abs(resultado.nacional['202602'] - (6.09 + 6.11 + 6.45) / 3) < 0.01);
  assert.ok(Math.abs(resultado.estados.SP['202602'] - (6.09 + 6.11) / 2) < 0.01);
  assert.equal(resultado.estados.RJ['202602'], 6.45);
});
```

**Step 2: Rodar teste — deve falhar**
```bash
npm test
```
Esperado: FAIL — "Cannot find module '../scripts/fontes/anp.mjs'"

**Step 3: Implementar anp.mjs**

```js
// scripts/fontes/anp.mjs
// Baixa CSVs anuais da ANP e retorna séries mensais por estado e nacional.
// Formato do CSV: semicolon-separated, primeira linha é cabeçalho.
// Colunas relevantes: "Estado - Sigla", "Produto", "Data da Coleta", "Valor de Venda"

// URL base — verificar na exploração da Task 1 se o padrão bate
const URL_BASE = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos/precos-revenda-';

export function parsearCsvAnp(csv, produto) {
  const linhas = csv.split('\n');
  const cabecalho = linhas[0].split(';').map((c) => c.trim().replace(/^"|"$/g, ''));
  const iEstado = cabecalho.findIndex((c) => c.includes('Estado - Sigla'));
  const iProduto = cabecalho.findIndex((c) => c === 'Produto');
  const iData = cabecalho.findIndex((c) => c.includes('Data da Coleta'));
  const iPreco = cabecalho.findIndex((c) => c.includes('Valor de Venda'));

  const registros = [];
  for (const linha of linhas.slice(1)) {
    if (!linha.trim()) continue;
    const cols = linha.split(';').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols[iProduto] !== produto) continue;
    const preco = parseFloat(cols[iPreco]?.replace(',', '.'));
    if (!Number.isFinite(preco)) continue;
    // Data: "DD/MM/YYYY" → periodo "AAAAMM"
    const [d, m, a] = cols[iData].split('/');
    if (!a) continue;
    const periodo = `${a}${m}`;
    registros.push({ estado: cols[iEstado], periodo, preco });
  }
  return registros;
}

export function agregarMensal(registros) {
  // Agrupa por periodo e estado, calcula média
  const porEstadoPeriodo = {};
  const porPeriodo = {};

  for (const { estado, periodo, preco } of registros) {
    porEstadoPeriodo[estado] ??= {};
    porEstadoPeriodo[estado][periodo] ??= { soma: 0, n: 0 };
    porEstadoPeriodo[estado][periodo].soma += preco;
    porEstadoPeriodo[estado][periodo].n += 1;

    porPeriodo[periodo] ??= { soma: 0, n: 0 };
    porPeriodo[periodo].soma += preco;
    porPeriodo[periodo].n += 1;
  }

  const estados = {};
  for (const [estado, periodos] of Object.entries(porEstadoPeriodo)) {
    estados[estado] = Object.fromEntries(
      Object.entries(periodos).map(([p, { soma, n }]) => [p, Math.round((soma / n) * 100) / 100])
    );
  }
  const nacional = Object.fromEntries(
    Object.entries(porPeriodo).map(([p, { soma, n }]) => [p, Math.round((soma / n) * 100) / 100])
  );
  return { nacional, estados };
}

export async function buscarAnp(codigoFonte, obterTexto) {
  // obterTexto(url) → Promise<string> — injetado para facilitar testes
  const anoAtual = new Date().getFullYear();
  const anoInicio = 2019;
  const registros = [];

  for (let ano = anoInicio; ano <= anoAtual; ano++) {
    const url = `${URL_BASE}${ano}.csv`;
    try {
      const csv = await obterTexto(url);
      registros.push(...parsearCsvAnp(csv, codigoFonte));
    } catch (e) {
      console.warn(`ANP ${ano}: ${e.message}`);
    }
  }
  return agregarMensal(registros);
}
```

**Step 4: Rodar testes**
```bash
npm test
```
Esperado: PASS

**Step 5: Commit**
```bash
git add scripts/fontes/anp.mjs test/precos.test.mjs test/fixtures/anp-amostra.csv
git commit -m "feat: parser ANP para preços de combustíveis"
```

---

## Task 3: Parser CONAB

**Files:**
- Create: `scripts/fontes/conab.mjs`
- Modify: `test/precos.test.mjs`

**Step 1: Escrever fixture e teste**

Após explorar a API CONAB na Task 1, criar fixture com resposta real:
```
test/fixtures/conab-arroz.json
```

Adicionar em `test/precos.test.mjs`:
```js
import { parsearRespostaConab } from '../scripts/fontes/conab.mjs';
import conabFixture from './fixtures/conab-arroz.json' assert { type: 'json' };

test('parsearRespostaConab extrai série mensal nacional e por estado', () => {
  const resultado = parsearRespostaConab(conabFixture);
  // Verificar com base no formato real da API
  assert.ok(resultado.nacional);
  assert.ok(Object.keys(resultado.nacional).every((k) => /^\d{6}$/.test(k)));
  assert.ok(Object.values(resultado.nacional).every((v) => typeof v === 'number'));
});
```

**Step 2: Rodar — deve falhar**
```bash
npm test
```

**Step 3: Implementar conab.mjs**

Estrutura base (adaptar ao formato real da API):
```js
// scripts/fontes/conab.mjs

const URL_CONAB = 'https://portaldeinformacoes.conab.gov.br/index.php/api/produto/consultaPrecoMedioMensalProdutoEstado';

export function parsearRespostaConab(json) {
  // Adaptar conforme formato real da API descoberto na Task 1
  // Espera-se array de { uf, mes, ano, preco } ou similar
  const porEstadoPeriodo = {};
  const porPeriodo = {};

  for (const linha of json) {
    const mes = String(linha.mes ?? linha.MES ?? '').padStart(2, '0');
    const ano = String(linha.ano ?? linha.ANO ?? '');
    const uf = linha.uf ?? linha.UF ?? linha.estado ?? '';
    const preco = parseFloat(linha.preco ?? linha.PRECO ?? linha.valor ?? 0);
    if (!mes || !ano || !Number.isFinite(preco) || preco <= 0) continue;
    const periodo = `${ano}${mes}`;

    porPeriodo[periodo] ??= { soma: 0, n: 0 };
    porPeriodo[periodo].soma += preco;
    porPeriodo[periodo].n += 1;

    if (uf) {
      porEstadoPeriodo[uf] ??= {};
      porEstadoPeriodo[uf][periodo] ??= { soma: 0, n: 0 };
      porEstadoPeriodo[uf][periodo].soma += preco;
      porEstadoPeriodo[uf][periodo].n += 1;
    }
  }

  const arred = (v) => Math.round(v * 100) / 100;
  const nacional = Object.fromEntries(
    Object.entries(porPeriodo).map(([p, { soma, n }]) => [p, arred(soma / n)])
  );
  const estados = {};
  for (const [uf, periodos] of Object.entries(porEstadoPeriodo)) {
    estados[uf] = Object.fromEntries(
      Object.entries(periodos).map(([p, { soma, n }]) => [p, arred(soma / n)])
    );
  }
  return { nacional, estados };
}

export async function buscarConab(codigoFonte, obterJson) {
  const json = await obterJson(`${URL_CONAB}?produto=${codigoFonte}`);
  return parsearRespostaConab(json);
}
```

**Step 4: Rodar testes**
```bash
npm test
```
Esperado: PASS

**Step 5: Commit**
```bash
git add scripts/fontes/conab.mjs test/precos.test.mjs test/fixtures/conab-arroz.json
git commit -m "feat: parser CONAB para preços de alimentos básicos"
```

---

## Task 4: Parser CEAGESP

**Files:**
- Create: `scripts/fontes/ceagesp.mjs`
- Modify: `test/precos.test.mjs`

**Nota:** CEAGESP pode não ter API JSON — pode ser necessário baixar planilhas Excel/CSV. Se for o caso, usar `node:stream` para parsear CSV ou uma lib simples (sem dependências externas — parsear manualmente como na ANP).

**Step 1: Fixture e teste**

Após explorar na Task 1:
```
test/fixtures/ceagesp-amostra.csv  (ou .json)
```

Adicionar em `test/precos.test.mjs`:
```js
import { parsearCeagesp, agregarMensalCeagesp } from '../scripts/fontes/ceagesp.mjs';

test('parsearCeagesp extrai produto, data e preço médio', async () => {
  const conteudo = await readFile(new URL('./fixtures/ceagesp-amostra.csv', import.meta.url), 'utf8');
  const registros = parsearCeagesp(conteudo, 'MORANGO');
  assert.ok(registros.length >= 1);
  assert.ok(registros[0].periodo);
  assert.ok(typeof registros[0].preco === 'number');
});
```

**Step 2: Rodar — deve falhar**
```bash
npm test
```

**Step 3: Implementar ceagesp.mjs**

```js
// scripts/fontes/ceagesp.mjs
// CEAGESP publica cotações diárias por produto.
// Adaptar URL e parsing conforme exploração na Task 1.

export function parsearCeagesp(conteudo, produto) {
  // Adaptar ao formato real (CSV ou JSON)
  // Retorna array de { periodo: 'AAAAMM', preco: number }
  const linhas = conteudo.split('\n');
  const registros = [];
  for (const linha of linhas.slice(1)) {
    if (!linha.trim()) continue;
    const cols = linha.split(';').map((c) => c.trim());
    if (!cols[0].toUpperCase().includes(produto.toUpperCase())) continue;
    // Adaptar índices de coluna conforme formato real
    const [d, m, a] = (cols[1] ?? '').split('/');
    if (!a) continue;
    const preco = parseFloat((cols[2] ?? '').replace(',', '.'));
    if (!Number.isFinite(preco)) continue;
    registros.push({ periodo: `${a}${m}`, preco });
  }
  return registros;
}

export function agregarMensalCeagesp(registros) {
  // CEAGESP é só São Paulo (capital), sem dados por estado
  const porPeriodo = {};
  for (const { periodo, preco } of registros) {
    porPeriodo[periodo] ??= { soma: 0, n: 0 };
    porPeriodo[periodo].soma += preco;
    porPeriodo[periodo].n += 1;
  }
  const nacional = Object.fromEntries(
    Object.entries(porPeriodo).map(([p, { soma, n }]) => [p, Math.round((soma / n) * 100) / 100])
  );
  // CEAGESP = SP, usar como proxy "nacional" e também como estado SP
  return { nacional, estados: { SP: { ...nacional } } };
}

export async function buscarCeagesp(codigoFonte, obterTexto) {
  // Adaptar URL conforme exploração
  const url = `http://www.ceagesp.gov.br/cotacoes/?produto=${codigoFonte}`;
  const conteudo = await obterTexto(url);
  const registros = parsearCeagesp(conteudo, codigoFonte);
  return agregarMensalCeagesp(registros);
}
```

**Step 4: Rodar testes**
```bash
npm test
```
Esperado: PASS

**Step 5: Commit**
```bash
git add scripts/fontes/ceagesp.mjs test/precos.test.mjs test/fixtures/ceagesp-amostra.csv
git commit -m "feat: parser CEAGESP para preços de hortifrutti"
```

---

## Task 5: Script principal atualizar-precos.mjs

**Files:**
- Create: `scripts/atualizar-precos.mjs`

```js
// scripts/atualizar-precos.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { MAPEAMENTO } from './mapeamento.mjs';
import { buscarAnp } from './fontes/anp.mjs';
import { buscarConab } from './fontes/conab.mjs';
import { buscarCeagesp } from './fontes/ceagesp.mjs';

const SAIDA = new URL('../data/precos.json', import.meta.url);

async function obterTexto(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return resp.text();
}

async function obterJson(url) {
  const resp = await fetch(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return resp.json();
}

const BUSCADORES = {
  anp: (item) => buscarAnp(item.codigoFonte, obterTexto),
  conab: (item) => buscarConab(item.codigoFonte, obterJson),
  ceagesp: (item) => buscarCeagesp(item.codigoFonte, obterTexto),
};

async function main() {
  const itens = {};
  const statusFontes = { anp: 'ok', conab: 'ok', ceagesp: 'ok' };

  for (const item of MAPEAMENTO) {
    const buscar = BUSCADORES[item.fonte];
    if (!buscar) continue;
    try {
      console.log(`${item.fonte}: ${item.nome}...`);
      const { nacional, estados } = await buscar(item);
      itens[item.id] = { nome: item.nome, unidade: item.unidade, nacional, estados };
    } catch (e) {
      console.warn(`  ERRO: ${e.message}`);
      statusFontes[item.fonte] = `erro: ${e.message.slice(0, 80)}`;
    }
  }

  const dados = { geradoEm: new Date().toISOString(), fontes: statusFontes, itens };

  const anterior = await readFile(SAIDA, 'utf8').then(JSON.parse, () => null);
  if (anterior && JSON.stringify(anterior.itens) === JSON.stringify(dados.itens)) {
    console.log('Dados iguais aos já salvos; nada a atualizar.');
    return;
  }

  await mkdir(new URL('.', SAIDA), { recursive: true });
  await writeFile(SAIDA, JSON.stringify(dados) + '\n');
  console.log(`OK: ${Object.keys(itens).length} itens → data/precos.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Step 1: Adicionar script ao package.json**

```json
"precos": "node scripts/atualizar-precos.mjs"
```

**Step 2: Rodar localmente**
```bash
npm run precos
```
Esperado: cria `data/precos.json` com os itens que funcionaram.

**Step 3: Commit**
```bash
git add scripts/atualizar-precos.mjs package.json
git commit -m "feat: script principal de atualização de preços reais"
```

---

## Task 6: Atualizar GitHub Action

**Files:**
- Modify: `.github/workflows/atualizar-dados.yml`

Adicionar passo após `npm run dados`:

```yaml
      - run: npm run precos
      - name: Commit dos dados
        run: |
          git add data/ipca.json data/precos.json
          if git diff --cached --quiet; then
            echo "Sem mudanças."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Atualiza dados do IPCA e preços"
          git push
```

**Step 1: Editar o workflow**

Substituir o passo de commit existente conforme acima.

**Step 2: Commit**
```bash
git add .github/workflows/atualizar-dados.yml
git commit -m "ci: adiciona coleta de preços reais ao workflow"
```

---

## Task 7: Frontend — carregar precos.json e exibir preço atual na tabela

**Files:**
- Modify: `assets/app.js`
- Modify: `index.html`

**Step 1: Carregar precos.json em app.js**

Na função `carregar()`, após carregar `ipca.json`:

```js
// Tenta carregar precos.json — se não existir, continua sem ele
let precos = null;
try {
  const respPrecos = await fetch('data/precos.json', { cache: 'no-cache' });
  if (respPrecos.ok) precos = await respPrecos.json();
} catch (_) {}
estado.precos = precos;
```

Adicionar `precos: null` ao objeto `estado`.

**Step 2: Adicionar coluna "Preço atual" na tabela**

Em `index.html`, adicionar coluna no `<thead>`:
```html
<th scope="col" class="num" id="col-preco">Preço atual</th>
```

Em `renderTabela()` em `app.js`, adicionar célula com preço atual do item (último mês disponível):

```js
function precoAtual(item) {
  const p = estado.precos?.itens?.[item.id];
  if (!p) return null;
  const uf = estado.ufSelecionada; // 'nacional' ou sigla do estado
  const serie = uf === 'nacional' || !p.estados?.[uf] ? p.nacional : p.estados[uf];
  const ultimoPeriodo = Object.keys(serie).sort().at(-1);
  return ultimoPeriodo ? { valor: serie[ultimoPeriodo], unidade: p.unidade } : null;
}
```

Na montagem das células da tabela:
```js
const pc = precoAtual(i);
const tdPreco = document.createElement('td');
tdPreco.className = 'num';
tdPreco.textContent = pc ? `${fmtReal.format(pc.valor)}/${pc.unidade}` : '—';
tr.append(nome, ...celulas, tdPreco);
```

**Step 3: Testar visualmente**
```bash
npm start
# abre http://localhost:3000
# verificar que coluna "Preço atual" aparece com valores para combustíveis/alimentos
```

**Step 4: Commit**
```bash
git add assets/app.js index.html
git commit -m "feat: exibe preço real atual na tabela"
```

---

## Task 8: Frontend — histórico de preços no gráfico

**Files:**
- Modify: `assets/app.js`

Quando o item selecionado tiver `precos.json`, adicionar segundo eixo (Y direito) com série de preço em R$.

**Step 1: Modificar renderGrafico()**

Após definir `datasets`, verificar se item tem preços:

```js
const precoItem = estado.precos?.itens?.[item.id];
if (precoItem) {
  const serie = precoItem.nacional;
  // Alinhar períodos com os do eixo X (meses desde início do mandato mais longo)
  // Para simplicidade, adicionar dataset com data absoluta no eixo X separado
  // OU: mostrar como dataset extra com índice de meses alinhado ao mandato Lula
  // (implementar conforme o que parecer mais claro visualmente)
  datasets.push({
    label: `Preço (${precoItem.unidade})`,
    data: Object.entries(serie).sort().map(([, v]) => v),
    borderColor: cor('--serie-preco') || '#aaa',
    yAxisID: 'yPreco',
    borderDash: [4, 4],
    pointRadius: 0,
    tension: 0,
  });
}
```

Adicionar segundo eixo em `scales`:
```js
yPreco: {
  display: !!precoItem,
  position: 'right',
  ticks: { color: texto2, callback: (v) => fmtReal.format(v) },
  grid: { display: false },
  border: { display: false },
},
```

Adicionar variável CSS em `style.css`:
```css
--serie-preco: #888;
```

**Step 2: Testar visualmente**
```bash
npm start
# Selecionar Gasolina → verificar segunda linha no gráfico com preço em R$
```

**Step 3: Commit**
```bash
git add assets/app.js assets/style.css
git commit -m "feat: exibe histórico de preço real no gráfico"
```

---

## Task 9: Frontend — filtro por estado

**Files:**
- Modify: `index.html`
- Modify: `assets/app.js`

Mostrar `<select>` de estado apenas quando o item selecionado tiver dados por estado.

**Step 1: Adicionar select em index.html**

```html
<div id="filtro-estado" hidden>
  <label>Estado
    <select id="estado-select">
      <option value="nacional">Nacional</option>
    </select>
  </label>
</div>
```

Colocar próximo aos outros filtros, mas só ativo quando relevante.

**Step 2: Lógica em app.js**

Adicionar `ufSelecionada: 'nacional'` ao `estado`.

Na função `selecionar(item)`, atualizar o select de estados:
```js
function atualizarFiltroEstado(item) {
  const precoItem = estado.precos?.itens?.[item.id];
  const filtro = $('filtro-estado');
  const sel = $('estado-select');
  if (!precoItem?.estados || Object.keys(precoItem.estados).length === 0) {
    filtro.hidden = true;
    return;
  }
  filtro.hidden = false;
  const ufs = ['nacional', ...Object.keys(precoItem.estados).sort()];
  sel.replaceChildren(...ufs.map((uf) => {
    const opt = document.createElement('option');
    opt.value = uf;
    opt.textContent = uf === 'nacional' ? 'Nacional' : uf;
    opt.selected = uf === estado.ufSelecionada;
    return opt;
  }));
}
```

Registrar listener:
```js
$('estado-select').addEventListener('input', (e) => {
  estado.ufSelecionada = e.target.value;
  if (estado.selecionado) renderGrafico(estado.selecionado);
  renderTabela();
});
```

Chamar `atualizarFiltroEstado(item)` dentro de `selecionar(item)`.

**Step 3: Testar visualmente**
```bash
npm start
# Selecionar Gasolina → deve aparecer filtro de estado
# Selecionar Morango → filtro some (CEAGESP só tem SP)
```

**Step 4: Commit**
```bash
git add assets/app.js index.html
git commit -m "feat: filtro de estado para preços com dados regionais"
```

---

## Checklist final

- [ ] `npm test` passa sem erros
- [ ] `npm run dados && npm run precos` gera os dois JSONs sem erro
- [ ] Site carrega com preço atual na tabela para combustíveis, alimentos e hortifrutti
- [ ] Gráfico mostra linha de preço real para itens com dados
- [ ] Filtro de estado aparece/some corretamente
- [ ] Itens sem preço real continuam mostrando "—" sem quebrar nada
- [ ] GitHub Action atualiza os dois arquivos no commit automático
