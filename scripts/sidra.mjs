// Leitura e transformação das respostas da API SIDRA do IBGE.

// Nível na estrutura do IPCA a partir do código no nome ("1101002.Arroz").
export function nivelPorCodigo(codigo) {
  if (!codigo) return 'geral';
  return { 1: 'grupo', 2: 'subgrupo', 4: 'item', 7: 'subitem' }[codigo.length] ?? 'outro';
}

export function separarNome(nomeCompleto) {
  const m = /^(\d+)\.(.*)$/.exec(nomeCompleto.trim());
  if (!m) return { codigo: '', nome: nomeCompleto.trim() };
  return { codigo: m[1], nome: m[2].trim() };
}

function chavePorRotulo(cabecalho, teste) {
  const chave = Object.keys(cabecalho).find((k) => teste(String(cabecalho[k])));
  if (!chave) throw new Error(`Coluna não encontrada no cabeçalho SIDRA: ${JSON.stringify(cabecalho)}`);
  return chave;
}

// linhas: array retornado por apisidra.ibge.gov.br/values (primeira linha = cabeçalho).
// Retorna [{ id, nomeCompleto, periodo, valor }].
export function lerLinhasSidra(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return [];
  const [cabecalho, ...dados] = linhas;
  const kMes = chavePorRotulo(cabecalho, (r) => r === 'Mês (Código)');
  const kCatId = chavePorRotulo(cabecalho, (r) => r.startsWith('Geral, grupo') && r.endsWith('(Código)'));
  const kCatNome = chavePorRotulo(cabecalho, (r) => r.startsWith('Geral, grupo') && !r.endsWith('(Código)'));
  return dados.map((l) => {
    const valor = Number.parseFloat(String(l.V).replace(',', '.'));
    return {
      id: String(l[kCatId]),
      nomeCompleto: String(l[kCatNome]),
      periodo: String(l[kMes]),
      valor: Number.isFinite(valor) ? valor : null,
    };
  });
}

// Junta registros de várias consultas/tabelas no formato do data/ipca.json.
// Registros posteriores sobrescrevem o nome (fica o nome mais recente).
export function montarDados(registros, { geradoEm, fontes }) {
  const periodos = [...new Set(registros.map((r) => r.periodo))].sort();
  const indicePeriodo = new Map(periodos.map((p, i) => [p, i]));
  const itens = new Map();
  for (const r of registros) {
    let item = itens.get(r.id);
    if (!item) {
      item = { id: r.id, valores: new Array(periodos.length).fill(null) };
      itens.set(r.id, item);
    }
    const { codigo, nome } = separarNome(r.nomeCompleto);
    if (!item.ultimoPeriodo || r.periodo >= item.ultimoPeriodo) {
      Object.assign(item, { codigo, nome, nivel: nivelPorCodigo(codigo), ultimoPeriodo: r.periodo });
    }
    if (r.valor !== null) item.valores[indicePeriodo.get(r.periodo)] = r.valor;
  }
  const lista = [...itens.values()]
    .map(({ ultimoPeriodo, ...resto }) => resto)
    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  return { geradoEm, fontes, periodos, itens: lista };
}
