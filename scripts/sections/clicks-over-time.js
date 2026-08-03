#!/usr/bin/env node
/**
 * scripts/sections/clicks-over-time.js — sección "Clicks a lo largo del tiempo"
 *
 * Serie diaria de clicks E impresiones de los últimos 90 días, siempre
 * anclada a la fecha del diagnóstico Flow (la fecha de la carpeta del
 * reporte), no a "hoy" — el período es fijo: 90 días antes de esa fecha.
 *
 * Rellena con 0 los días sin datos en GSC (la API solo devuelve filas para
 * fechas con actividad) para que la serie sea continua día a día.
 *
 * Uso:
 *   node scripts/sections/clicks-over-time.js <client> <reportDate YYYY-MM-DD>
 * Imprime a stdout: { "clicksOverTime": { startDate, endDate, clicks, impressions } }
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays, shiftDate } from '../lib/dates.js';
import { getAuthClient, getSearchAnalyticsByDate } from '../lib/gsc.js';

const WINDOW_DAYS = 90;

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del diagnóstico Flow (YYYY-MM-DD) — ancla los 90 días
 */
export async function fetchClicksOverTime(config, reportDate) {
  const range = lastNDays(WINDOW_DAYS, { today: reportDate });

  const auth = await getAuthClient();
  const { rows } = await getSearchAnalyticsByDate(auth, {
    siteUrl: config.gsc.siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
  });

  const byDate = new Map(rows.map(r => [r.date, r]));
  const clicks = [];
  const impressions = [];
  for (let d = range.startDate; d <= range.endDate; d = shiftDate(d, 1)) {
    const row = byDate.get(d);
    clicks.push(row ? row.clicks : 0);
    impressions.push(row ? row.impressions : 0);
  }

  return {
    clicksOverTime: { startDate: range.startDate, endDate: range.endDate, clicks, impressions },
    _meta: { daysWithData: rows.length, totalDays: clicks.length },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/clicks-over-time.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchClicksOverTime(config, reportDate);

  console.error(`Período: ${result.clicksOverTime.startDate} → ${result.clicksOverTime.endDate} (${result._meta.totalDays} días, ${result._meta.daysWithData} con datos)`);
  console.log(JSON.stringify({ clicksOverTime: result.clicksOverTime }, null, 2));
}
