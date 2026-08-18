#!/usr/bin/env node
/**
 * scripts/sections/query-variations.js — sección "Consulta principal y variaciones"
 *
 * Genera una fila por cada URL de config.crawl.seedUrls con:
 *   - mainQuery: la query de GSC con más clicks para esa URL (dimension
 *     PAGE, operator equals — mismo filtro que usa findings.js).
 *   - variations: hasta MAX_VARIATIONS queries siguientes, ordenadas por
 *     clicks (empate -> impresiones).
 *
 * A diferencia de "Hallazgos: Contenido faltante", acá SÍ se incluyen
 * queries de marca a propósito: para el home (u otra landing brand-heavy)
 * la consulta principal real suele ser la marca, y eso es información
 * correcta para esta tabla, no ruido a filtrar.
 *
 * Uso:
 *   node scripts/sections/query-variations.js <client> [reportDate YYYY-MM-DD]
 * Imprime a stdout: { "queryVariations": [{ url, mainQuery, variations }, ...] }
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';

const DEFAULT_DAYS = 28;
const MAX_QUERIES_PER_PAGE = 50;
const MAX_VARIATIONS = 5;

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} [reportDate]  fecha del reporte (YYYY-MM-DD) — ancla el período; default "hoy"
 */
export async function fetchQueryVariations(config, reportDate) {
  const days = config.keywords?.days || DEFAULT_DAYS;
  const range = reportDate ? lastNDays(days, { today: reportDate }) : lastNDays(days);

  const auth = await getAuthClient();
  const urls = (config.crawl?.seedUrls || []).map(path => `https://${config.domain}${path}`);

  const rows = [];
  for (const url of urls) {
    const { rows: gscRows } = await getSearchAnalytics(auth, {
      siteUrl: config.gsc.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['query'],
      rowLimit: MAX_QUERIES_PER_PAGE,
      dimensionFilterGroups: [{ filters: [{ dimension: 'PAGE', operator: 'equals', expression: url }] }],
    });

    const sorted = gscRows
      .filter(r => !r.query.includes('://')) // query = URL literal (ruido, no es un término real)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

    rows.push({
      url,
      mainQuery: sorted[0]?.query ?? null,
      variations: sorted.slice(1, 1 + MAX_VARIATIONS).map(r => r.query),
    });
  }

  return { queryVariations: rows, _meta: { urlsAnalyzed: urls.length, range } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/query-variations.js <client> [reportDate YYYY-MM-DD]');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchQueryVariations(config, reportDate);

  console.error(`URLs analizadas: ${result._meta.urlsAnalyzed} | período: ${result._meta.range.startDate} → ${result._meta.range.endDate}`);
  console.log(JSON.stringify({ queryVariations: result.queryVariations }, null, 2));
}
