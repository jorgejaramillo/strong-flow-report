#!/usr/bin/env node
/**
 * scripts/sections/landings-crawl.js — sección "Landings: Descargar HTML para análisis"
 *
 * Descarga el HTML renderizado (Cloudflare Browser Rendering) de las
 * clients/<slug>/config.json → crawl.seedUrls (respetando crawl.maxPages)
 * y lo guarda en reports/<slug>/<reportDate>/data/crawl/.
 *
 * Si la descarga rápida (comportamiento por defecto) devuelve muy poco
 * texto visible — típico en sitios con hidratación JS lenta, donde
 * Cloudflare devuelve el DOM "a medias" — se reintenta esa misma URL
 * simulando que la navegación termine (`gotoOptions.waitUntil: networkidle0`)
 * y dándole unos segundos extra (`waitForTimeout`) antes de capturar el
 * HTML. Un solo reintento, no siempre: así el caso feliz sigue siendo
 * rápido y solo se paga el costo extra de tiempo cuando hace falta.
 *
 * Esta es la parte "mecánica" de la sección: descargar y dejar constancia de
 * la ruta local. El análisis de errores (aiActions) lo hace el skill
 * "analista" sobre estos mismos archivos, en un paso aparte.
 *
 * Uso:
 *   node scripts/sections/landings-crawl.js <client> <reportDate>
 * Imprime a stdout: { "landingsCrawl": [{ url, localPath, retried }, ...] }
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';
import { loadEnv } from '../lib/env.js';

const MIN_VISIBLE_TEXT_CHARS = 200;
const SLOW_WAIT_MS = 5000;

function slugify(url) {
  const path = url
    .replace(/^https?:\/\/[^/]+\/?/, '')
    .replace(/\/$/, '')
    .replace(/\.html$/, '');
  return (path === '' ? 'index' : path).replace(/[/?=&]/g, '_');
}

/** Saca head/script/style/tags y colapsa espacios, para medir cuánto texto "real" trajo la descarga. */
function extractVisibleText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchContent(accountId, apiToken, url, extraOpts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'], ...extraOpts }),
  });
  return res.json();
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
  for (const [i, url] of urls.entries()) {
    console.error(`→ [${i + 1}/${urls.length}] Descargando seed url: ${url}`);
    const fileName = `${slugify(url)}.html`;

    let json = await fetchContent(accountId, apiToken, url);
    let retried = false;

    if (json.success && extractVisibleText(json.result).length < MIN_VISIBLE_TEXT_CHARS) {
      console.error(`  ↻ texto insuficiente (<${MIN_VISIBLE_TEXT_CHARS} chars) — reintentando con espera larga (waitForTimeout=${SLOW_WAIT_MS}ms, waitUntil=networkidle0)`);
      json = await fetchContent(accountId, apiToken, url, { gotoOptions: { waitUntil: 'networkidle0' }, waitForTimeout: SLOW_WAIT_MS });
      retried = true;
    }

    if (!json.success) {
      console.error(`  ✗ ${url} (${JSON.stringify(json.errors)})`);
      landingsCrawl.push({ url, localPath: null, error: JSON.stringify(json.errors), retried });
      continue;
    }

    const localPath = join(relOutDir, fileName);
    writeFileSync(join(ROOT, localPath), json.result, 'utf-8');
    console.error(`  ✓ ${url} -> ${localPath}${retried ? ' (tras reintento)' : ''}`);
    landingsCrawl.push({ url, localPath, retried });
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

  console.log(JSON.stringify({ landingsCrawl }, null, 2));
}
