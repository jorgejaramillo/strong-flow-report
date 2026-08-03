#!/usr/bin/env node
/**
 * scripts/sections/cannibalization.js — sección "Mapa de canibalización de keywords"
 *
 * Algoritmo (mcp-google-search-console/gsc-seo-analyzer/prompts/cannibalization.md):
 *   1. Agrupar filas query+page por query.
 *   2. Contar cuántas URLs distintas tienen impresiones >= MIN_IMPRESSIONS.
 *   3. count > 1 => canibalización potencial.
 *   4. Dentro del grupo: URL principal = más clicks, empate -> menor posición, empate -> más impresiones.
 *   5. Severidad de cada URL canibalizada: alta (>100 impr. y pos.<20), media (50-100 impr.), baja (resto).
 *
 * El template muestra hasta MAX_GROUPS grupos de canibalización, uno por query,
 * ordenados por severidad y luego por impresiones totales del grupo.
 *
 * Uso:
 *   node scripts/sections/cannibalization.js <client> [--days 28]
 * Imprime a stdout: { "cannibalization": [{ query, rows, action }, ...] } (array vacío si no hay canibalización)
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';

const MIN_IMPRESSIONS = 50;
const MAX_GROUPS = 10;

function severity(row) {
  if (row.impressions > 100 && row.position < 20) return 'high';
  if (row.impressions >= 50 && row.impressions <= 100) return 'medium';
  return 'low';
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/**
 * @param {object} config  clients/<slug>/config.json ya parseado
 * @param {{startDate: string, endDate: string}} [range]  default: últimos 28 días
 * @returns {Promise<{cannibalization: Array, _meta: object}>}
 */
export async function fetchCannibalization(config, range = lastNDays(28)) {
  const auth = await getAuthClient();
  const { rows } = await getSearchAnalytics(auth, {
    siteUrl: config.gsc.siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['query', 'page'],
    rowLimit: 10000,
  });

  // 1. Agrupar por query
  const byQuery = new Map();
  for (const row of rows) {
    if (!byQuery.has(row.query)) byQuery.set(row.query, []);
    byQuery.get(row.query).push(row);
  }

  // 2-3. Detectar grupos con >1 URL sobre el umbral de impresiones
  const groups = [];
  for (const [query, queryRows] of byQuery) {
    const eligible = queryRows.filter(r => r.impressions >= MIN_IMPRESSIONS);
    if (eligible.length <= 1) continue;

    // 4. Ordenar: más clicks -> menor posición -> más impresiones
    const sorted = [...eligible].sort((a, b) =>
      b.clicks - a.clicks || a.position - b.position || b.impressions - a.impressions
    );
    const [main, ...rest] = sorted;
    const worstSeverity = rest
      .map(severity)
      .sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0];

    groups.push({ query, main, rest, worstSeverity });
  }

  if (groups.length === 0) return { cannibalization: [], _meta: { totalGroupsDetected: 0 } };

  // Ordenar por severidad, desempate por impresiones totales de la query
  groups.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity];
    if (rankDiff !== 0) return rankDiff;
    const totalA = a.main.impressions + a.rest.reduce((s, r) => s + r.impressions, 0);
    const totalB = b.main.impressions + b.rest.reduce((s, r) => s + r.impressions, 0);
    return totalB - totalA;
  });

  const cannibalization = groups.slice(0, MAX_GROUPS).map(group => {
    const rows_ = [
      { url: group.main.page, impressions: group.main.impressions, clicks: group.main.clicks, position: group.main.position, status: 'Principal', statusClass: 'badge-success' },
      ...group.rest.map(r => ({ url: r.page, impressions: r.impressions, clicks: r.clicks, position: r.position, status: 'Canibaliza', statusClass: 'badge-warning' })),
    ];
    return { query: group.query, rows: rows_ };
  });

  return {
    cannibalization,
    _meta: { totalGroupsDetected: groups.length, groupsShown: cannibalization.length },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, ...rest] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/cannibalization.js <client> [--days 28]');
    process.exit(1);
  }
  const daysFlagIdx = rest.indexOf('--days');
  const days = daysFlagIdx >= 0 ? parseInt(rest[daysFlagIdx + 1], 10) : 28;

  const config = loadClientConfig(client);
  const result = await fetchCannibalization(config, lastNDays(days));

  console.error(`Grupos de canibalización detectados: ${result._meta.totalGroupsDetected} (mostrando ${result._meta.groupsShown}, máx ${MAX_GROUPS})`);
  console.log(JSON.stringify({ cannibalization: result.cannibalization }, null, 2));
}
