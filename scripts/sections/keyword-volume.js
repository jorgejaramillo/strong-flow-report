#!/usr/bin/env node
/**
 * scripts/sections/keyword-volume.js — sección "Volumen de búsqueda"
 *
 * Genera una fila por seedKeyword con su volumen de búsqueda mensual
 * promedio (vía DataForSEO keywords_data/google_ads/search_volume) — país
 * e idioma tomados de config.site. Si Google Ads no tiene datos suficientes
 * para esa keyword, el volumen queda null.
 *
 * Requiere DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD en .env.
 *
 * Uso:
 *   node scripts/sections/keyword-volume.js <client>
 * Imprime a stdout: { "keywordVolume": { rows } }
 */
import { loadClientConfig } from '../lib/config.js';
import { googleKeywordSearchVolume } from '../lib/dataforseo.js';

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

export async function fetchKeywordVolume(config) {
  const keywords = config.seedKeywords || [];

  const locationName = LOCATION_NAMES[config.site?.country];
  if (!locationName) {
    throw new Error(`No hay location_name mapeado para site.country="${config.site?.country}". Agrégalo a LOCATION_NAMES en scripts/sections/keyword-volume.js.`);
  }

  let volumeByKeyword = {};
  let cost = 0;
  if (keywords.length > 0) {
    const volumeResult = await googleKeywordSearchVolume({ keywords, locationName, languageCode: config.site.language });
    volumeByKeyword = volumeResult.volumeByKeyword;
    cost = volumeResult.cost;
  }

  const rows = keywords.map(keyword => ({
    query: keyword,
    volume: volumeByKeyword[keyword] ?? null,
  }));

  return { keywordVolume: { rows }, _meta: { cost } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/keyword-volume.js <client>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchKeywordVolume(config);

  console.error(`Keywords: ${result.keywordVolume.rows.length} (volumen vía DataForSEO) | costo DataForSEO: $${result._meta.cost.toFixed(4)}`);
  console.log(JSON.stringify({ keywordVolume: result.keywordVolume }, null, 2));
}
