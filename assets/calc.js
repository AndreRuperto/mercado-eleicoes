// Cálculos compartilhados entre o site (navegador) e os testes (Node).

export const MANDATOS = [
  { id: 'bolsonaro', nome: 'Bolsonaro', nomeCompleto: 'Jair Bolsonaro', inicio: '201901', fim: '202212' },
  { id: 'lula', nome: 'Lula', nomeCompleto: 'Luiz Inácio Lula da Silva', inicio: '202301', fim: null },
];

// Lista de meses "AAAAMM" de inicio até fim, inclusive.
export function mesesEntre(inicio, fim) {
  const meses = [];
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(4, 6));
  const limite = Number(fim);
  while (ano * 100 + mes <= limite) {
    meses.push(`${ano}${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

// Recorta o mandato ao intervalo com dados disponíveis.
export function periodoDoMandato(mandato, ultimoPeriodo) {
  const fim = mandato.fim && mandato.fim < ultimoPeriodo ? mandato.fim : ultimoPeriodo;
  if (fim < mandato.inicio) return [];
  return mesesEntre(mandato.inicio, fim);
}

// variacoes: objeto { "AAAAMM": variação mensal em % }.
// Retorna null se faltar qualquer mês do período (sem série completa).
export function calcularMandato(variacoes, meses) {
  if (!meses.length) return null;
  const indice = [100];
  let fator = 1;
  for (const m of meses) {
    const v = variacoes[m];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    fator *= 1 + v / 100;
    indice.push(fator * 100);
  }
  return {
    meses: meses.length,
    acumulado: (fator - 1) * 100,
    anualizado: (Math.pow(fator, 12 / meses.length) - 1) * 100,
    indice,
  };
}

// Converte o item do JSON (valores alinhados a `periodos`) em objeto por mês.
export function variacoesDoItem(item, periodos) {
  const out = {};
  periodos.forEach((p, i) => {
    const v = item.valores[i];
    if (v !== null && v !== undefined) out[p] = v;
  });
  return out;
}
