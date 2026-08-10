#!/usr/bin/env node
/**
 * scripts/sections/keyword-positions.js — sección "Posiciones de keywords en el tiempo"
 *
 * Genera una fila por seedKeyword con la posición orgánica actual (vía
 * DataForSEO dataforseo_labs/google/ranked_keywords) — país e idioma
 * tomados de config.site. Si el dominio no rankea esa keyword en el índice
 * de DataForSEO Labs, la posición queda null.
 *
 * De momento el gráfico arranca con un solo mes (el actual). La idea es
 * que sea acumulativa: cada corrida mensual futura debe agregar una
 * columna nueva a la derecha conservando los meses anteriores — eso
 * todavía no está implementado (requeriría persistir `keywordPositions`
 * entre corridas, ej. en `clients/<slug>/keyword-positions-history.json`).
 *
 * Requiere DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD en .env.
 *
 * Uso:
 *   node scripts/sections/keyword-positions.js <client>
 * Imprime a stdout: { "keywordPositions": { months, rows } }
 */
import { loadClientConfig } from '../lib/config.js';
import { googleRankedKeywordPositions } from '../lib/dataforseo.js';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** location_name completo que espera DataForSEO, por código alpha-3 de país (config.site.country) */
const LOCATION_NAMES = {
  ecu: 'Ecuador',
  col: 'Colombia',
  mex: 'Mexico',
  usa: 'United States',
  per: 'Peru',
  chl: 'Chile',
  arg: 'Argentina',
};

function currentMonthLabel(today = new Date()) {
  return `${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;
}

export async function fetchKeywordPositions(config) {
  const keywords = config.seedKeywords || [];
  const months = [currentMonthLabel()];

  const locationName = LOCATION_NAMES[config.site?.country];
  if (!locationName) {
    throw new Error(`No hay location_name mapeado para site.country="${config.site?.country}". Agrégalo a LOCATION_NAMES en scripts/sections/keyword-positions.js.`);
  }

  let positionByKeyword = {};
  let cost = 0;
  if (keywords.length > 0) {
    const positionResult = await googleRankedKeywordPositions({ target: config.domain, keywords, locationName, languageCode: config.site.language });
    positionByKeyword = positionResult.positionByKeyword;
    cost = positionResult.cost;
  }

  const rows = keywords.map(keyword => ({
    keyword,
    positions: [positionByKeyword[keyword] ?? null],
  }));

  return { keywordPositions: { months, rows }, _meta: { cost } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/keyword-positions.js <client>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchKeywordPositions(config);

  console.error(`Keywords: ${result.keywordPositions.rows.length} | Mes: ${result.keywordPositions.months[0]} (posición real vía DataForSEO) | costo DataForSEO: $${result._meta.cost.toFixed(4)}`);
  console.log(JSON.stringify({ keywordPositions: result.keywordPositions }, null, 2));
}
