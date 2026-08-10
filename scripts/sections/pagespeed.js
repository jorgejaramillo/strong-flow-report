#!/usr/bin/env node
/**
 * scripts/sections/pagespeed.js — sección "PageSpeed"
 *
 * Corre Unlighthouse (Lighthouse a escala) contra las mismas URLs de
 * clients/<slug>/config.json → crawl.seedUrls y guarda scores + screenshots
 * (foto final + filmstrip de carga) en reports/<slug>/<reportDate>/data/pagespeed/.
 *
 * Unlighthouse (@unlighthouse/core → lighthouse 13) requiere Node >=22; este
 * script detecta la versión activa y, si es menor, relanza el binario de
 * unlighthouse-ci con el Node 22 instalado vía nvm (`nvm install 22`, ver
 * README). El resto del pipeline (este script incluido) puede seguir
 * corriendo con el Node del sistema.
 *
 * Uso:
 *   node scripts/sections/pagespeed.js <client> <reportDate>
 * Imprime a stdout: { "pagespeed": { generatedAt, pages: [{ url, path, performance, accessibility, bestPractices, seo, screenshot, thumbnails }] } }
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, sep } from 'path';
import { spawnSync } from 'child_process';
import { loadClientConfig, ROOT } from '../lib/config.js';

/** Node 22 es requisito duro de @unlighthouse/core (usa fs/promises#glob). */
function resolveNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) return process.execPath;

  const nvmDir = process.env.NVM_DIR || join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  const candidates = existsSync(versionsDir)
    ? readdirSync(versionsDir).filter(v => /^v(2[2-9]|[3-9]\d)/.test(v)).sort()
    : [];

  if (candidates.length === 0) {
    throw new Error('Unlighthouse requiere Node >=22. Instala uno con: nvm install 22 (ver README).');
  }
  return join(versionsDir, candidates[candidates.length - 1], 'bin', 'node');
}

/** "/" -> ''  ·  "/credito" -> 'credito'  ·  "/blog/post/" -> 'blog/post' (mismo esquema de carpetas que usa unlighthouse-ci). */
function routeToDir(path) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function toPosix(p) {
  return p.split(sep).join('/');
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — define la carpeta de salida
 */
export async function fetchPagespeed(config, reportDate) {
  const nodeBin = resolveNode22();
  const unlighthouseCiBin = join(ROOT, 'node_modules', 'unlighthouse', 'bin', 'unlighthouse-ci.mjs');
  if (!existsSync(unlighthouseCiBin)) {
    throw new Error('unlighthouse no está instalado. Corre: npm install (raíz del repo)');
  }

  const paths = config.crawl.seedUrls.slice(0, config.crawl.maxPages);
  const relOutDir = join('reports', config.slug, reportDate, 'data', 'pagespeed');
  const absOutDir = join(ROOT, relOutDir);
  mkdirSync(absOutDir, { recursive: true });

  const result = spawnSync(nodeBin, [
    unlighthouseCiBin,
    '--site', `https://${config.domain}`,
    '--urls', paths.join(','),
    '--output-path', absOutDir,
    '--reporter', 'json',
    '--no-cache',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.status !== 0) {
    throw new Error(`unlighthouse-ci salió con código ${result.status}`);
  }

  const ciResultPath = join(absOutDir, 'ci-result.json');
  const ciResult = JSON.parse(readFileSync(ciResultPath, 'utf-8'));

  const pages = ciResult.map(row => {
    const dirName = routeToDir(row.path);
    const relReportDir = join(relOutDir, 'reports', dirName);
    const thumbsDir = join(ROOT, relReportDir, '__screenshot-thumbnails__');
    const thumbnails = existsSync(thumbsDir)
      ? readdirSync(thumbsDir)
        .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
        .map(f => toPosix(join(relReportDir, '__screenshot-thumbnails__', f)))
      : [];

    return {
      url: `https://${config.domain}${row.path}`,
      path: row.path,
      performance: Math.round((row.performance ?? 0) * 100),
      accessibility: Math.round((row.accessibility ?? 0) * 100),
      bestPractices: Math.round((row['best-practices'] ?? 0) * 100),
      seo: Math.round((row.seo ?? 0) * 100),
      screenshot: toPosix(join(relReportDir, 'screenshot.jpeg')),
      thumbnails,
    };
  });

  return { pagespeed: { generatedAt: new Date().toISOString(), pages } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/pagespeed.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const { pagespeed } = await fetchPagespeed(config, reportDate);

  for (const p of pagespeed.pages) {
    console.error(`✓ ${p.path || '/'} — perf ${p.performance} · a11y ${p.accessibility} · bp ${p.bestPractices} · seo ${p.seo}`);
  }
  console.log(JSON.stringify({ pagespeed }, null, 2));
}
