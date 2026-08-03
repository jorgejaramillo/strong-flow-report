#!/usr/bin/env node
/**
 * scripts/sections/keyword-positions.js — sección "Posiciones de keywords en el tiempo"
 *
 * Genera la matriz para el heatmap (meses x seedKeywords, posición promedio).
 *
 * De momento son datos DUMMY (posición aleatoria 1-30 por keyword/mes) —
 * placeholder mientras se integra la fuente real (posición mensual por
 * query vía GSC, dimensión "date" agrupada por mes).
 *
 * Uso:
 *   node scripts/sections/keyword-positions.js <client> [months=6]
 * Imprime a stdout: { "keywordPositions": { keywords, months, data } }
 */
import { loadClientConfig } from '../lib/config.js';

const DEFAULT_MONTHS = 6;
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function lastNMonthLabels(n, today = new Date()) {
  const labels = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    labels.push(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  }
  return labels;
}

export async function fetchKeywordPositions(config, monthsCount = DEFAULT_MONTHS) {
  const keywords = config.seedKeywords || [];
  const months = lastNMonthLabels(monthsCount);

  const data = [];
  keywords.forEach((_, ki) => {
    months.forEach((_, mi) => {
      const position = Math.floor(Math.random() * 30) + 1; // dummy
      data.push([mi, ki, position]);
    });
  });

  return { keywordPositions: { keywords, months, data } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, monthsArg] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/keyword-positions.js <client> [months=6]');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchKeywordPositions(config, monthsArg ? Number(monthsArg) : undefined);

  console.error(`Keywords: ${result.keywordPositions.keywords.length} | Meses: ${result.keywordPositions.months.length} (DATOS DUMMY)`);
  console.log(JSON.stringify(result, null, 2));
}
