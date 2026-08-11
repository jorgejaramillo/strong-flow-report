#!/usr/bin/env node
/**
 * scripts/sections/keyword-volume.js — sección "Volumen de búsqueda"
 *
 * Genera una fila por seedKeyword cruzando tres fuentes independientes:
 *   - DataForSEO (keywords_data/google_ads/search_volume): volumen de
 *     búsqueda mensual promedio. Si Google Ads no tiene datos suficientes
 *     para esa keyword, el volumen queda null.
 *   - GSC (search_analytics, dimensión query): clicks e impresiones reales
 *     de esa keyword exacta (case-insensitive) en el período. Si la keyword
 *     no recibió tráfico, quedan en 0.
 *   - ValueSERP (búsqueda en vivo en Google): posición en el SERP actual de
 *     la primera URL de resultados orgánicos que pertenezca a config.domain
 *     (o un subdominio suyo). Si el dominio no aparece entre los `num`
 *     resultados pedidos, la posición queda null. Esto es independiente de
 *     GSC (no depende de que Google Search Console tenga datos históricos)
 *     y de DataForSEO (no depende de su índice) — es una lectura en vivo.
 *
 * El largo del período GSC sale de clients/<slug>/config.json →
 * keywords.days (default 28 si el cliente no lo define), igual que
 * scripts/sections/keywords.js.
 *
 * Requiere DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD y VALUESERP_API_KEY en
 * .env.
 *
 * Uso:
 *   node scripts/sections/keyword-volume.js <client> [reportDate YYYY-MM-DD]
 * Imprime a stdout: { "keywordVolume": { rows } }
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics } from '../lib/gsc.js';
import { googleKeywordSearchVolume } from '../lib/dataforseo.js';
import { valueSerpSearch } from '../lib/valueserp.js';

const DEFAULT_DAYS = 28;

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

/** código de país alpha-2 que espera ValueSERP (param `gl`), por código alpha-3 de país (config.site.country) */
const COUNTRY_CODES = {
  ecu: 'ec',
  col: 'co',
  mex: 'mx',
  usa: 'us',
  per: 'pe',
  chl: 'cl',
  arg: 'ar',
};

function normalizeHost(host) {
  return (host || '').toLowerCase().replace(/^www\./, '');
}

function resultHost(result) {
  if (result.domain) return result.domain;
  try {
    return new URL(result.link).hostname;
  } catch {
    return '';
  }
}

/** Busca la primera URL de `organicResults` que pertenezca a `domain` (o un subdominio) y devuelve su posición. */
function findDomainPosition(organicResults, domain) {
  const targetHost = normalizeHost(domain);
  for (const result of organicResults || []) {
    const host = normalizeHost(resultHost(result));
    if (host === targetHost || host.endsWith(`.${targetHost}`)) return result.position ?? null;
  }
  return null;
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} [reportDate]  fecha del reporte (YYYY-MM-DD) — ancla el período GSC; default "hoy"
 */
export async function fetchKeywordVolume(config, reportDate) {
  const keywords = config.seedKeywords || [];

  const locationName = LOCATION_NAMES[config.site?.country];
  if (!locationName) {
    throw new Error(`No hay location_name mapeado para site.country="${config.site?.country}". Agrégalo a LOCATION_NAMES en scripts/sections/keyword-volume.js.`);
  }
  const countryCode = COUNTRY_CODES[config.site?.country];
  if (!countryCode) {
    throw new Error(`No hay código de país mapeado para site.country="${config.site?.country}". Agrégalo a COUNTRY_CODES en scripts/sections/keyword-volume.js.`);
  }

  const days = config.keywords?.days || DEFAULT_DAYS;
  const range = reportDate ? lastNDays(days, { today: reportDate }) : lastNDays(days);

  let volumeByKeyword = {};
  let dataforseoCost = 0;
  let gscRows = [];
  if (keywords.length > 0) {
    const [volumeResult, auth] = await Promise.all([
      googleKeywordSearchVolume({ keywords, locationName, languageCode: config.site.language }),
      getAuthClient(),
    ]);
    volumeByKeyword = volumeResult.volumeByKeyword;
    dataforseoCost = volumeResult.cost;

    const gscResult = await getSearchAnalytics(auth, {
      siteUrl: config.gsc.siteUrl, startDate: range.startDate, endDate: range.endDate, dimensions: ['query'], rowLimit: 1000,
    });
    gscRows = gscResult.rows;
  }
  const gscByQuery = new Map(gscRows.map(r => [r.query.toLowerCase(), r]));

  // ValueSERP: una búsqueda en vivo por keyword — secuencial, y si una falla
  // (rate limit, timeout) se sigue con las demás en vez de abortar la sección.
  const positionByKeyword = {};
  let valueserpErrors = 0;
  for (const keyword of keywords) {
    try {
      const serp = await valueSerpSearch({ query: keyword, location: locationName, countryCode, languageCode: config.site.language });
      positionByKeyword[keyword] = findDomainPosition(serp.organic_results, config.domain);
    } catch (err) {
      console.error(`ValueSERP falló para "${keyword}": ${err.message}`);
      positionByKeyword[keyword] = null;
      valueserpErrors++;
    }
  }

  const rows = keywords.map(keyword => {
    const gscRow = gscByQuery.get(keyword.toLowerCase());
    return {
      query: keyword,
      volume: volumeByKeyword[keyword] ?? null,
      clicks: gscRow?.clicks ?? 0,
      impressions: gscRow?.impressions ?? 0,
      position: positionByKeyword[keyword] ?? null,
    };
  });

  return { keywordVolume: { rows }, _meta: { dataforseoCost, range, valueserpErrors } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/keyword-volume.js <client> [reportDate YYYY-MM-DD]');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchKeywordVolume(config, reportDate);

  console.error(`Keywords: ${result.keywordVolume.rows.length} | período: ${result._meta.range.startDate} → ${result._meta.range.endDate} | costo DataForSEO: $${result._meta.dataforseoCost.toFixed(4)} | errores ValueSERP: ${result._meta.valueserpErrors}`);
  console.log(JSON.stringify({ keywordVolume: result.keywordVolume }, null, 2));
}
