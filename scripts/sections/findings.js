#!/usr/bin/env node
/**
 * scripts/sections/findings.js — sección "Hallazgos: Contenido faltante"
 *
 * Cruza dos fuentes reales:
 *   1. GSC: queries por las que cada landing ya recibe impresiones/clicks
 *      (get_search_analytics filtrado por page, igual al filtro "pageUrl"
 *      que server.js aplica para el MCP: dimension PAGE, operator equals).
 *   2. El HTML descargado por el crawler (reports/<slug>/<fecha>/data/crawl/,
 *      poblado por scripts/sections/landings-crawl.js) — se le extrae el
 *      texto con extractFromHtml() de mcp-google-search-console/scrapping.
 *
 * Un hallazgo = una query con impresiones relevantes cuyo término NO aparece
 * (ni como frase ni como todas sus palabras clave) en el texto extraído de
 * esa landing — es decir, contenido que falta pese a que Google ya la asocia
 * con esa página.
 *
 * Requiere que landingsCrawl ya esté en reports/<slug>/<reportDate>/data.json
 * (correr primero scripts/sections/landings-crawl.js).
 *
 * Uso:
 *   node scripts/sections/findings.js <client> <reportDate YYYY-MM-DD>
 * Imprime a stdout: { "findings": [{ page, detail }, ...] }
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';
import { lastNDays } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';
import { extractFromHtml } from '../../mcp-google-search-console/scrapping/scripts/extract-text.js';

const MIN_IMPRESSIONS = 20;
const MAX_QUERIES_PER_PAGE = 50;
const MAX_FINDINGS = 10;

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** true si la query aparece como frase completa, o si todas sus palabras clave (>2 letras) están presentes */
function isQueryMissing(query, wordSetPadded, phraseSet) {
  const normQuery = normalize(query);
  if (phraseSet.has(normQuery) || wordSetPadded.includes(` ${normQuery} `)) return false;

  const tokens = normQuery.split(' ').filter(t => t.length > 2);
  if (tokens.length === 0) return false;
  const allTokensPresent = tokens.every(t => wordSetPadded.includes(` ${t} `));
  return !allTokensPresent;
}

/**
 * @param {object} config          clients/<slug>/config.json ya parseado
 * @param {Array<{url:string, localPath:string}>} landingsCrawl  salida de landings-crawl.js
 * @param {{startDate:string, endDate:string}} [range]  default: últimos 28 días
 */
export async function fetchFindings(config, landingsCrawl, range = lastNDays(28)) {
  const auth = await getAuthClient();
  const candidates = [];

  for (const { url, localPath } of landingsCrawl) {
    if (!localPath) continue;

    let html;
    try {
      html = readFileSync(join(ROOT, localPath), 'utf-8');
    } catch {
      continue; // archivo no disponible localmente, se salta
    }
    const extracted = extractFromHtml(html);
    const wordSetPadded = ` ${extracted.wordSet.join(' ')} `;
    const phraseSet = new Set(extracted.phrases);

    const { rows } = await getSearchAnalytics(auth, {
      siteUrl: config.gsc.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['query'],
      rowLimit: MAX_QUERIES_PER_PAGE,
      dimensionFilterGroups: [{ filters: [{ dimension: 'PAGE', operator: 'equals', expression: url }] }],
    });

    for (const row of rows) {
      if (row.impressions < MIN_IMPRESSIONS) continue;
      if (row.query.includes('://')) continue; // query = URL literal (ruido, no es un término de contenido)
      if (!isQueryMissing(row.query, wordSetPadded, phraseSet)) continue;

      candidates.push({
        page: url,
        detail: `Rankea para <strong>"${row.query}"</strong> (pos. ${row.position}, ${row.impressions} impr.) pero el término no aparece en el texto de la página.`,
        impressions: row.impressions,
      });
    }
  }

  const findings = candidates
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_FINDINGS)
    .map(({ page, detail }) => ({ page, detail }));

  return { findings, _meta: { pagesAnalyzed: landingsCrawl.filter(l => l.localPath).length, candidatesFound: candidates.length } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/findings.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const dataPath = join(ROOT, 'reports', client, reportDate, 'data.json');
  const existingData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const landingsCrawl = existingData.landingsCrawl;
  if (!landingsCrawl || landingsCrawl.length === 0) {
    console.error(`No hay landingsCrawl en ${dataPath}. Corre primero: node scripts/sections/landings-crawl.js ${client} ${reportDate}`);
    process.exit(1);
  }

  const result = await fetchFindings(config, landingsCrawl);

  console.error(`Landings analizadas: ${result._meta.pagesAnalyzed} | candidatos encontrados: ${result._meta.candidatesFound} | mostrando: ${result.findings.length}`);
  console.log(JSON.stringify({ findings: result.findings }, null, 2));
}
