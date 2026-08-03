#!/usr/bin/env node
/**
 * scripts/sections/sitemap.js — sección "Análisis de Sitemap.xml"
 *
 * Trae las estadísticas "a nivel de sitio" que devuelve list_sitemaps del MCP
 * de Google Search Console: sitemaps registrados, URLs enviadas/indexadas,
 * tasa de indexación y sitemaps con errores/warnings.
 *
 * Uso:
 *   node scripts/sections/sitemap.js <client>
 * Imprime a stdout: { "sitemap": { totalSitemaps, totalSubmitted, totalIndexed, indexRate, sitemapsWithErrors, sitemapsWithWarnings } }
 */
import { loadClientConfig } from '../lib/config.js';
import { getAuthClient, listSitemaps } from '../lib/gsc.js';

/** @param {object} config  clients/<slug>/config.json ya parseado */
export async function fetchSitemap(config) {
  const auth = await getAuthClient();
  const result = await listSitemaps(auth, { siteUrl: config.gsc.siteUrl });

  const globalStats = result.globalStats || {
    totalSubmitted: 0, totalIndexed: 0, indexRate: '0%', sitemapsWithErrors: 0, sitemapsWithWarnings: 0,
  };

  return {
    sitemap: {
      totalSitemaps: result.totalSitemaps,
      totalSubmitted: globalStats.totalSubmitted,
      totalIndexed: globalStats.totalIndexed,
      indexRate: globalStats.indexRate,
      sitemapsWithErrors: globalStats.sitemapsWithErrors,
      sitemapsWithWarnings: globalStats.sitemapsWithWarnings,
    },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/sitemap.js <client>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const { sitemap } = await fetchSitemap(config);

  console.error(`Sitemaps: ${sitemap.totalSitemaps} | Enviadas: ${sitemap.totalSubmitted} | Indexadas: ${sitemap.totalIndexed} (${sitemap.indexRate})`);
  console.log(JSON.stringify({ sitemap }, null, 2));
}
