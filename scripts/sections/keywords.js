#!/usr/bin/env node
/**
 * scripts/sections/keywords.js — sección "Rendimiento de keywords"
 *
 * Trae queries reales de GSC y las agrupa en 4 tablas:
 *   - general:   no-brand, ordenadas por impresiones (alcance)
 *   - target:    SOLO las queries listadas en clients/<slug>/config.json → seedKeywords
 *                (match exacto, case-insensitive). Si una seedKeyword no tiene datos
 *                en el período, simplemente no aparece — no se inventan filas en 0.
 *   - brand:     top queries de marca por clicks
 *   - nonBrand:  top queries no-marca por clicks
 *
 * Cada fila incluye "delta": variación de clicks vs el período anterior del
 * mismo largo (ej. si el período son 28 días, se compara contra los 28 días
 * inmediatamente anteriores).
 *
 * El largo del período sale de clients/<slug>/config.json → keywords.days
 * (default 28 si el cliente no lo define).
 *
 * "Brand" = la query contiene alguno de los términos listados en
 * clients/<slug>/config.json → keywords.brand (lista explícita por cliente,
 * ya no se infiere automáticamente de config.name/config.domain).
 *
 * keywords.non_brand es opcional: si el cliente la define (no vacía), "no
 * brand" se restringe a esos términos explícitos; si está vacía o ausente,
 * "no brand" es simplemente "todo lo que no matcheó como brand" (default).
 *
 * Uso:
 *   node scripts/sections/keywords.js <client> [reportDate YYYY-MM-DD]
 * Imprime a stdout: { "keywords": { general, target, brand, nonBrand } }
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays, previousPeriod } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';

const ROWS_GENERAL = 8;
const ROWS_BRAND_EACH = 6;
const DEFAULT_DAYS = 28;

function isBrand(query, config) {
  const q = query.toLowerCase();
  const brandTerms = config.keywords?.brand || [];
  return brandTerms.some(term => q.includes(term.toLowerCase()));
}

function isExplicitNonBrand(query, config) {
  const nonBrandTerms = config.keywords?.non_brand || [];
  if (nonBrandTerms.length === 0) return true; // sin lista explícita: todo no-brand aplica
  const q = query.toLowerCase();
  return nonBrandTerms.some(term => q.includes(term.toLowerCase()));
}

function formatDelta(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} [reportDate]  fecha del reporte (YYYY-MM-DD) — ancla el período; default "hoy"
 */
export async function fetchKeywords(config, reportDate) {
  const days = config.keywords?.days || DEFAULT_DAYS;
  const range = reportDate ? lastNDays(days, { today: reportDate }) : lastNDays(days);
  const prevRange = previousPeriod(range);

  const auth = await getAuthClient();
  const [{ rows }, { rows: prevRows }] = await Promise.all([
    getSearchAnalytics(auth, { siteUrl: config.gsc.siteUrl, startDate: range.startDate, endDate: range.endDate, dimensions: ['query'], rowLimit: 1000 }),
    getSearchAnalytics(auth, { siteUrl: config.gsc.siteUrl, startDate: prevRange.startDate, endDate: prevRange.endDate, dimensions: ['query'], rowLimit: 1000 }),
  ]);

  const prevClicksByQuery = new Map(prevRows.map(r => [r.query.toLowerCase(), r.clicks]));
  const toKwRow = r => {
    const prevClicks = prevClicksByQuery.get(r.query.toLowerCase()) || 0;
    return { query: r.query, clicks: r.clicks, impressions: r.impressions, position: r.position, delta: formatDelta(r.clicks - prevClicks) };
  };

  const brandRows = rows.filter(r => isBrand(r.query, config));
  const nonBrandRows = rows.filter(r => !isBrand(r.query, config) && isExplicitNonBrand(r.query, config));

  const seedKeywords = config.seedKeywords || [];
  const target = seedKeywords
    .map(seed => rows.find(r => r.query.toLowerCase() === seed.toLowerCase()))
    .filter(Boolean)
    .map(toKwRow);
  const targetQueries = new Set(target.map(r => r.query));

  const general = [...nonBrandRows]
    .filter(r => !targetQueries.has(r.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, ROWS_GENERAL)
    .map(toKwRow);

  const brand = [...brandRows].sort((a, b) => b.clicks - a.clicks).slice(0, ROWS_BRAND_EACH).map(toKwRow);
  const nonBrand = [...nonBrandRows].sort((a, b) => b.clicks - a.clicks).slice(0, ROWS_BRAND_EACH).map(toKwRow);

  return {
    keywords: { general, target, brand, nonBrand },
    _meta: { totalQueries: rows.length, brandQueries: brandRows.length, nonBrandQueries: nonBrandRows.length, range, prevRange },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/keywords.js <client> [reportDate YYYY-MM-DD]');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchKeywords(config, reportDate);

  console.error(`Período: ${result._meta.range.startDate} → ${result._meta.range.endDate} | anterior: ${result._meta.prevRange.startDate} → ${result._meta.prevRange.endDate}`);
  console.error(`Queries totales: ${result._meta.totalQueries} (brand: ${result._meta.brandQueries}, non-brand: ${result._meta.nonBrandQueries})`);
  console.log(JSON.stringify({ keywords: result.keywords }, null, 2));
}
