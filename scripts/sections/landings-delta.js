#!/usr/bin/env node
/**
 * scripts/sections/landings-delta.js — sección "Landings: Ganadores y perdedores (última semana)"
 *
 * Compara clicks por página (dimensión "page") de la última semana vs la semana
 * anterior, relativas a la fecha del reporte (la fecha de la carpeta
 * reports/<client>/<fecha>/, no la fecha de hoy) — así el mismo script sirve para
 * regenerar reportes de cualquier fecha pasada.
 *
 * Uso:
 *   node scripts/sections/landings-delta.js <client> <reportDate> [--max 5]
 * Imprime a stdout: { "winners": [...], "losers": [...], "landingsPeriodLabel": "..." }
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays, previousPeriod, formatDateEs } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';

const MAX_ROWS = 5;

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — ancla la "última semana"
 * @param {{maxRows?: number}} [opts]
 */
export async function fetchLandingsDelta(config, reportDate, { maxRows = MAX_ROWS } = {}) {
  const currentWeek = lastNDays(7, { today: reportDate });
  const previousWeek = previousPeriod(currentWeek);

  const auth = await getAuthClient();
  const [current, previous] = await Promise.all([
    getSearchAnalytics(auth, { siteUrl: config.gsc.siteUrl, startDate: currentWeek.startDate, endDate: currentWeek.endDate, dimensions: ['page'], rowLimit: 25000 }),
    getSearchAnalytics(auth, { siteUrl: config.gsc.siteUrl, startDate: previousWeek.startDate, endDate: previousWeek.endDate, dimensions: ['page'], rowLimit: 25000 }),
  ]);

  const currByPage = new Map(current.rows.map(r => [r.page, r.clicks]));
  const prevByPage = new Map(previous.rows.map(r => [r.page, r.clicks]));
  const allPages = new Set([...currByPage.keys(), ...prevByPage.keys()]);

  const deltas = [...allPages]
    .map(page => {
      const clicks = currByPage.get(page) || 0;
      const prev = prevByPage.get(page) || 0;
      return { page, clicks, prev, delta: clicks - prev };
    })
    .filter(d => d.delta !== 0);

  const winners = deltas
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, maxRows)
    .map(d => ({ page: d.page, clicks: d.clicks, prev: d.prev, delta: `+${d.delta}` }));

  const losers = deltas
    .filter(d => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, maxRows)
    .map(d => ({ page: d.page, clicks: d.clicks, prev: d.prev, delta: `${d.delta}` }));

  const landingsPeriodLabel = `${formatDateEs(currentWeek.startDate)} → ${formatDateEs(currentWeek.endDate)}`;

  return {
    winners,
    losers,
    landingsPeriodLabel,
    _meta: { currentWeek, previousWeek, pagesCompared: allPages.size },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate, ...rest] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/landings-delta.js <client> <reportDate YYYY-MM-DD> [--max 5]');
    process.exit(1);
  }
  const maxFlagIdx = rest.indexOf('--max');
  const maxRows = maxFlagIdx >= 0 ? parseInt(rest[maxFlagIdx + 1], 10) : MAX_ROWS;

  const config = loadClientConfig(client);
  const result = await fetchLandingsDelta(config, reportDate, { maxRows });

  console.error(`Semana actual: ${result._meta.currentWeek.startDate} → ${result._meta.currentWeek.endDate} | anterior: ${result._meta.previousWeek.startDate} → ${result._meta.previousWeek.endDate} | páginas comparadas: ${result._meta.pagesCompared}`);
  console.log(JSON.stringify({ winners: result.winners, losers: result.losers, landingsPeriodLabel: result.landingsPeriodLabel }, null, 2));
}
