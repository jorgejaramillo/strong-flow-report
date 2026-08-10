#!/usr/bin/env node
/**
 * scripts/sections/sitemap.js — sección "Análisis de Sitemap.xml"
 *
 * Trae las estadísticas "a nivel de sitio" que devuelve list_sitemaps del MCP
 * de Google Search Console: sitemaps registrados, URLs enviadas y sitemaps
 * con errores/warnings.
 *
 * El campo "indexed" de list_sitemaps es poco confiable (solo cuenta lo que
 * Google asocia al sitemap exacto que lo trajo, y suele quedar en 0 aunque
 * las páginas sí estén indexadas). Por eso la indexación real se calcula
 * aparte, inspeccionando cada URL de config.crawl.seedUrls con inspect_url
 * (misma API que alimenta el reporte "Cobertura de páginas" en la UI de GSC)
 * y leyendo su coverageState.
 *
 * Uso:
 *   node scripts/sections/sitemap.js <client>
 * Imprime a stdout: { "sitemap": { totalSitemaps, totalSubmitted, sitemapsWithErrors, sitemapsWithWarnings, seedUrlsIndexing: { totalChecked, totalIndexed, indexRate, pages: [{ path, url, coverageState, indexed }] } } }
 */
import { loadClientConfig } from '../lib/config.js';
import { getAuthClient, listSitemaps } from '../lib/gsc.js';
import { inspectUrl } from '../../mcp-google-search-console/tools/url-inspection.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Inspecciona config.crawl.seedUrls una por una (con una pequeña pausa entre
 * llamadas para no pegarle a los límites de cuota de la URL Inspection API)
 * y clasifica cada una como indexada según su coverageState real.
 */
async function inspectSeedUrls(auth, config) {
  const paths = config.crawl.seedUrls.slice(0, config.crawl.maxPages);
  const pages = [];

  for (const path of paths) {
    const url = `https://${config.domain}${path}`;
    try {
      const { indexing } = await inspectUrl(auth, { siteUrl: config.gsc.siteUrl, inspectionUrl: url });
      pages.push({ path, url, coverageState: indexing.coverageState, indexed: indexing.verdict === 'PASS' });
    } catch (error) {
      pages.push({ path, url, coverageState: `Error: ${error.message}`, indexed: false });
    }
    await sleep(300);
  }

  const totalIndexed = pages.filter(p => p.indexed).length;
  return {
    totalChecked: pages.length,
    totalIndexed,
    indexRate: pages.length > 0 ? `${((totalIndexed / pages.length) * 100).toFixed(1)}%` : '0%',
    pages,
  };
}

/** @param {object} config  clients/<slug>/config.json ya parseado */
export async function fetchSitemap(config) {
  const auth = await getAuthClient();
  const result = await listSitemaps(auth, { siteUrl: config.gsc.siteUrl });

  const globalStats = result.globalStats || {
    totalSubmitted: 0, sitemapsWithErrors: 0, sitemapsWithWarnings: 0,
  };

  const seedUrlsIndexing = await inspectSeedUrls(auth, config);

  return {
    sitemap: {
      totalSitemaps: result.totalSitemaps,
      totalSubmitted: globalStats.totalSubmitted,
      sitemapsWithErrors: globalStats.sitemapsWithErrors,
      sitemapsWithWarnings: globalStats.sitemapsWithWarnings,
      seedUrlsIndexing,
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

  for (const p of sitemap.seedUrlsIndexing.pages) {
    console.error(`${p.indexed ? '✓' : '✗'} ${p.path || '/'} — ${p.coverageState}`);
  }
  console.error(`Sitemaps: ${sitemap.totalSitemaps} | Enviadas: ${sitemap.totalSubmitted} | Indexadas (seedUrls): ${sitemap.seedUrlsIndexing.totalIndexed}/${sitemap.seedUrlsIndexing.totalChecked} (${sitemap.seedUrlsIndexing.indexRate})`);
  console.log(JSON.stringify({ sitemap }, null, 2));
}
