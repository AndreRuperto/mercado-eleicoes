# Mercado & Eleições — Preços: Bolsonaro × Lula

Site estático que compara quanto os preços subiram nos governos Bolsonaro (jan/2019–dez/2022) e Lula (jan/2023 em diante), usando a variação mensal do **IPCA do IBGE** para o índice geral e para cada grupo, subgrupo, item e subitem (arroz, gasolina, aluguel, energia elétrica etc.).

Para cada produto o site mostra:

- **Média ao ano** (padrão): taxa anual equivalente; é a comparação justa porque os mandatos têm durações diferentes.
- **Acumulado no mandato**: variações mensais compostas.
- **Gráfico**: o que custava R$ 100 no primeiro mês de cada mandato, mês a mês.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html`, `assets/` | o site (HTML/CSS/JS puro, gráfico com Chart.js via CDN) |
| `assets/calc.js` | cálculos (usado pelo site e pelos testes) |
| `scripts/atualizar-dados.mjs` | baixa o IPCA da API SIDRA do IBGE e grava `data/ipca.json` |
| `.github/workflows/atualizar-dados.yml` | roda o script todo dia e faz commit quando há mês novo |
| `test/` | testes (`npm test`) |

## Rodando localmente

Requer Node 20+ e Python 3 (só para servir os arquivos).

```bash
npm run dados   # baixa os dados do IBGE para data/ipca.json
npm start       # abre em http://localhost:8000
npm test
```

O site precisa ser servido por HTTP (abrir o `index.html` direto do disco não carrega o JSON).

## Dados

- IBGE/SIDRA, Tabela 1419 (IPCA até dez/2019) e Tabela 7060 (IPCA a partir de jan/2020), variável 63 (variação mensal), classificação 315.
- Os produtos são identificados pelo código de categoria da SIDRA. Quando o IBGE altera a cesta do IPCA, um produto pode não ter todos os meses de um mandato; nesse caso o site mostra "—" em vez de um número parcial.
