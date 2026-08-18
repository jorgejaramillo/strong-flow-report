#!/usr/bin/env node
/**
 * scripts/sections/sitemap.js — sección "Análisis de Sitemap.xml"
 *
 * Trae las estadísticas de list_sitemaps del MCP de Google Search Console
 * (sitemaps registrados, URLs enviadas y con errores/warnings) y además
 * descarga el contenido real de cada sitemap (siguiendo sitemap index si
 * aplica) para extraer las URLs que efectivamente contiene. Con eso se
 * arma un resumen de qué URLs de config.crawl.seedUrls NO aparecen en
 * ningún sitemap descargado.
 *
 * El campo "indexed" de list_sitemaps es poco confiable (solo cuenta lo que
 * Google asocia al sitemap exacto que lo trajo, y suele quedar en 0 aunque
 * las páginas sí estén indexadas). Por eso la indexación real se calcula
 * aparte, inspeccionando cada URL de config.crawl.seedUrls con inspect_url
 * (misma API que alimenta el reporte "Cobertura de páginas" en la UI de GSC)
 * y leyendo su coverageState.
 *
 * Uso:
 *   node scripts/sections/sitemap.js <client> <reportDate YYYY-MM-DD>
 * Imprime a stdout: { "sitemap": { totalSitemaps, totalSubmitted, sitemapsWithErrors, sitemapsWithWarnings, sitemaps: [...], totalUrlsInSitemaps, seedUrlsIndexing: {...}, seedUrlsNotInSitemap: [...] } }
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';
import { getAuthClient, listSitemaps } from '../lib/gsc.js';
import { inspectUrl } from '../../mcp-google-search-console/tools/url-inspection.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Quita la barra final (salvo raíz) para poder comparar URLs de fuentes distintas. */
function normalizeUrl(url) {
  return url.trim().replace(/\/$/, '') || '/';
}

/** Descarga un sitemap.xml y extrae sus <loc>. Detecta si es un sitemap index por el tag raíz. */
async function downloadSitemapXml(sitemapUrl) {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1].trim());
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return { xml, locs, isIndex };
}

/** Guarda el XML crudo en outDir, evitando pisar nombres repetidos entre sitemaps distintos. */
function saveSitemapFile(outDir, sitemapUrl, xml, usedFilenames) {
  let base = (new URL(sitemapUrl).pathname.split('/').pop() || 'sitemap.xml').split('?')[0];
  if (!base.endsWith('.xml')) base += '.xml';
  let filename = base;
  let n = 2;
  while (usedFilenames.has(filename)) {
    filename = base.replace(/\.xml$/, `-${n}.xml`);
    n++;
  }
  usedFilenames.add(filename);
  const relPath = join(outDir, filename);
  writeFileSync(join(ROOT, relPath), xml, 'utf-8');
  return relPath;
}

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

/**
 * Descarga cada sitemap registrado en GSC (siguiendo un nivel de sitemap
 * index si aplica) y devuelve la fila de la tabla + el set acumulado de
 * URLs de página encontradas en el contenido real.
 */
async function downloadSitemaps(entries, outDir) {
  const usedFilenames = new Set();
  const pageUrls = new Set();
  const sitemaps = [];

  for (const entry of entries) {
    const row = {
      path: entry.path,
      isSitemapsIndex: entry.isSitemapsIndex,
      lastSubmitted: entry.lastSubmitted,
      lastDownloaded: entry.lastDownloaded,
      submitted: entry.totals.submitted,
      indexed: entry.totals.indexed,
      indexRate: entry.totals.indexRate,
      errors: entry.errors,
      warnings: entry.warnings,
      status: entry.status,
      download: { ok: false, urlCount: 0 },
    };

    try {
      const { xml, locs, isIndex } = await downloadSitemapXml(entry.path);
      row.download.localPath = saveSitemapFile(outDir, entry.path, xml, usedFilenames);

      if (entry.isSitemapsIndex || isIndex) {
        // sitemap index: cada <loc> es OTRO sitemap, hay que bajarlos para sacar las URLs reales
        let childUrlCount = 0;
        for (const childUrl of locs) {
          try {
            const child = await downloadSitemapXml(childUrl);
            saveSitemapFile(outDir, childUrl, child.xml, usedFilenames);
            child.locs.forEach(u => pageUrls.add(normalizeUrl(u)));
            childUrlCount += child.locs.length;
          } catch {
            // un sitemap hijo caído no debe tumbar el resto del análisis
          }
        }
        row.download.urlCount = childUrlCount;
      } else {
        locs.forEach(u => pageUrls.add(normalizeUrl(u)));
        row.download.urlCount = locs.length;
      }
      row.download.ok = true;
    } catch (error) {
      row.download.error = error.message;
    }

    sitemaps.push(row);
  }

  return { sitemaps, pageUrls };
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — define la carpeta de salida
 */
export async function fetchSitemap(config, reportDate) {
  const auth = await getAuthClient();
  const result = await listSitemaps(auth, { siteUrl: config.gsc.siteUrl });

  const globalStats = result.globalStats || {
    totalSubmitted: 0, sitemapsWithErrors: 0, sitemapsWithWarnings: 0,
  };

  const outDir = join('reports', config.slug, reportDate, 'data', 'sitemaps');
  mkdirSync(join(ROOT, outDir), { recursive: true });
  const { sitemaps, pageUrls } = await downloadSitemaps(result.sitemaps || [], outDir);

  const seedUrlsIndexing = await inspectSeedUrls(auth, config);

  const seedUrlsNotInSitemap = (config.crawl.seedUrls || [])
    .map(path => ({ path, url: `https://${config.domain}${path}` }))
    .filter(({ url }) => !pageUrls.has(normalizeUrl(url)));

  return {
    sitemap: {
      totalSitemaps: result.totalSitemaps,
      totalSubmitted: globalStats.totalSubmitted,
      sitemapsWithErrors: globalStats.sitemapsWithErrors,
      sitemapsWithWarnings: globalStats.sitemapsWithWarnings,
      sitemaps,
      totalUrlsInSitemaps: pageUrls.size,
      seedUrlsIndexing,
      seedUrlsNotInSitemap,
    },
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/sitemap.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const { sitemap } = await fetchSitemap(config, reportDate);

  for (const sm of sitemap.sitemaps) {
    console.error(`${sm.download.ok ? '✓' : '✗'} ${sm.path} — ${sm.download.ok ? `${sm.download.urlCount} URLs` : sm.download.error}`);
  }
  for (const p of sitemap.seedUrlsIndexing.pages) {
    console.error(`${p.indexed ? '✓' : '✗'} ${p.path || '/'} — ${p.coverageState}`);
  }
  console.error(`Sitemaps: ${sitemap.totalSitemaps} | Enviadas: ${sitemap.totalSubmitted} | URLs en sitemaps descargados: ${sitemap.totalUrlsInSitemaps} | Indexadas (seedUrls): ${sitemap.seedUrlsIndexing.totalIndexed}/${sitemap.seedUrlsIndexing.totalChecked} (${sitemap.seedUrlsIndexing.indexRate})`);
  if (sitemap.seedUrlsNotInSitemap.length) {
    console.error(`seedUrls fuera de los sitemaps (${sitemap.seedUrlsNotInSitemap.length}): ${sitemap.seedUrlsNotInSitemap.map(u => u.path).join(', ')}`);
  }
  console.log(JSON.stringify({ sitemap }, null, 2));
}
