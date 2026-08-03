#!/usr/bin/env node
/**
 * scripts/sections/landings-crawl.js — sección "Landings: Descargar HTML para análisis"
 *
 * Descarga el HTML renderizado (Cloudflare Browser Rendering) de las
 * clients/<slug>/config.json → crawl.seedUrls (respetando crawl.maxPages)
 * y lo guarda en reports/<slug>/<reportDate>/data/crawl/.
 *
 * Esta es la parte "mecánica" de la sección: descargar y dejar constancia de
 * la ruta local. El análisis de errores (aiActions) lo hace el skill
 * "analista" sobre estos mismos archivos, en un paso aparte.
 *
 * Uso:
 *   node scripts/sections/landings-crawl.js <client> <reportDate>
 * Imprime a stdout: { "landingsCrawl": [{ url, localPath }, ...] }
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';
import { loadEnv } from '../lib/env.js';

function slugify(url) {
  const path = url
    .replace(/^https?:\/\/[^/]+\/?/, '')
    .replace(/\/$/, '')
    .replace(/\.html$/, '');
  return (path === '' ? 'index' : path).replace(/[/?=&]/g, '_');
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — define la carpeta de salida
 */
export async function fetchLandingsCrawl(config, reportDate) {
  loadEnv();
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Faltan CF_ACCOUNT_ID / CF_API_TOKEN en .env (Cloudflare Browser Rendering)');
  }

  const urls = config.crawl.seedUrls.slice(0, config.crawl.maxPages).map(p => `https://${config.domain}${p}`);
  const relOutDir = join('reports', config.slug, reportDate, 'data', 'crawl');
  mkdirSync(join(ROOT, relOutDir), { recursive: true });

  const landingsCrawl = [];
  for (const url of urls) {
    const fileName = `${slugify(url)}.html`;
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'] }),
    });
    const json = await res.json();

    if (!json.success) {
      landingsCrawl.push({ url, localPath: null, error: JSON.stringify(json.errors) });
      continue;
    }

    writeFileSync(join(ROOT, relOutDir, fileName), json.result, 'utf-8');
    landingsCrawl.push({ url, localPath: join(relOutDir, fileName) });
  }

  return { landingsCrawl };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/landings-crawl.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const { landingsCrawl } = await fetchLandingsCrawl(config, reportDate);

  for (const item of landingsCrawl) {
    console.error(item.localPath ? `✓ ${item.url} -> ${item.localPath}` : `✗ ${item.url} (${item.error})`);
  }
  console.log(JSON.stringify({ landingsCrawl }, null, 2));
}
