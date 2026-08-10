#!/usr/bin/env node
/**
 * scripts/sections/pagespeed.js — sección "PageSpeed"
 *
 * Corre Unlighthouse (Lighthouse a escala) ÚNICAMENTE contra las URLs de
 * clients/<slug>/config.json → crawl.seedUrls (sitemap/robots.txt/link
 * crawler quedan desactivados — nunca se auditan URLs fuera de esa lista) y
 * guarda scores + screenshots (foto final + filmstrip de carga) en
 * reports/<slug>/<reportDate>/data/pagespeed/. Corre una URL a la vez
 * (puppeteerClusterOptions.maxConcurrency=1 vía pagespeed-unlighthouse.config.mjs)
 * para que sea lo más liviano posible en CPU/RAM.
 *
 * Como unlighthouse-ci no imprime avance por URL fuera de una TTY interactiva,
 * este script detecta cada URL terminada por la aparición de su lighthouse.json
 * en disco y llama a `onPage` en el momento — así se puede mostrar progreso
 * real 1 a 1 en vez de esperar a que termine todo el batch.
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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, sep } from 'path';
import { spawn } from 'child_process';
import slugify from 'slugify';
import sanitize from 'sanitize-filename';
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

/**
 * "/" -> ''  ·  "/credito" -> 'credito'  ·  "/yo.html" -> 'yo'  ·  "/blog/Post/" -> 'blog/post'
 * Replica exacta de `sanitiseUrlForFilePath` en @unlighthouse/core (trim slashes, quita
 * ".html", slugify+sanitize por segmento) — tiene que coincidir con el nombre de carpeta
 * que unlighthouse-ci realmente usa, si no los paths de screenshot quedan rotos.
 */
function routeToDir(path) {
  let p = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
  return p.split('/').map(part => sanitize(slugify(part))).join('/');
}

function toPosix(p) {
  return p.split(sep).join('/');
}

function readScores(lighthouseJsonPath) {
  const lh = JSON.parse(readFileSync(lighthouseJsonPath, 'utf-8'));
  const c = lh.categories ?? {};
  return {
    performance: Math.round((c.performance?.score ?? 0) * 100),
    accessibility: Math.round((c.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((c['best-practices']?.score ?? 0) * 100),
    seo: Math.round((c.seo?.score ?? 0) * 100),
  };
}

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — define la carpeta de salida
 * @param {object} [opts]
 * @param {(info: {path: string, index: number, total: number, elapsed: number, scores: object|null}) => void} [opts.onPage]
 *   Llamado apenas termina cada URL (detectado por la aparición de su lighthouse.json en disco —
 *   unlighthouse-ci no imprime progreso por URL cuando no corre en una TTY interactiva).
 */
export async function fetchPagespeed(config, reportDate, { onPage } = {}) {
  const nodeBin = resolveNode22();
  const unlighthouseCiBin = join(ROOT, 'node_modules', 'unlighthouse', 'bin', 'unlighthouse-ci.mjs');
  if (!existsSync(unlighthouseCiBin)) {
    throw new Error('unlighthouse no está instalado. Corre: npm install (raíz del repo)');
  }

  // Únicamente las URLs de crawl.seedUrls — nunca las que unlighthouse pudiera
  // descubrir solo (sitemap/robots.txt/link crawler quedan desactivados abajo).
  const paths = config.crawl.seedUrls.slice(0, config.crawl.maxPages);
  const relOutDir = join('reports', config.slug, reportDate, 'data', 'pagespeed');
  const absOutDir = join(ROOT, relOutDir);
  const reportsRootDir = join(absOutDir, 'reports');
  mkdirSync(absOutDir, { recursive: true });

  const child = spawn(nodeBin, [
    unlighthouseCiBin,
    '--site', `https://${config.domain}`,
    '--urls', paths.join(','),
    '--output-path', absOutDir,
    '--reporter', 'json',
    '--no-cache',
    '--disable-sitemap',
    '--disable-robots-txt',
    '--config-file', join(ROOT, 'scripts', 'sections', 'pagespeed-unlighthouse.config.mjs'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d) => { stdoutBuf += d; });
  child.stderr.on('data', (d) => { stderrBuf += d; });

  const t0 = Date.now();
  const pending = new Map(paths.map(p => [p, routeToDir(p)]));
  let done = 0;
  const pollOnce = () => {
    for (const [path, dirName] of pending) {
      const lhPath = join(reportsRootDir, dirName, 'lighthouse.json');
      // mtime, no solo existencia: si el reportDate se re-corre, puede haber
      // un lighthouse.json viejo de un intento anterior ya sentado ahí.
      let mtimeMs;
      try { mtimeMs = statSync(lhPath).mtimeMs; } catch { continue; }
      if (mtimeMs < t0) continue;
      pending.delete(path);
      done += 1;
      let scores = null;
      try { scores = readScores(lhPath); } catch { /* se re-lee al final desde ci-result.json */ }
      onPage?.({ path, index: done, total: paths.length, elapsed: (Date.now() - t0) / 1000, scores });
    }
  };
  const pollTimer = setInterval(pollOnce, 1000);

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  clearInterval(pollTimer);
  pollOnce(); // última pasada: agarra páginas que terminaron justo antes del cierre
  process.stderr.write(stdoutBuf);
  process.stderr.write(stderrBuf);

  if (exitCode !== 0) {
    throw new Error(`unlighthouse-ci salió con código ${exitCode}`);
  }

  const ciResultPath = join(absOutDir, 'ci-result.json');
  const ciResult = JSON.parse(readFileSync(ciResultPath, 'utf-8'));

  const allowedPaths = new Set(paths);
  const extras = ciResult.filter(row => !allowedPaths.has(row.path));
  if (extras.length) {
    console.error(`Aviso: unlighthouse devolvió ${extras.length} URL(s) fuera de crawl.seedUrls, se ignoran: ${extras.map(r => r.path).join(', ')}`);
  }

  const pages = ciResult.filter(row => allowedPaths.has(row.path)).map(row => {
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
  const { pagespeed } = await fetchPagespeed(config, reportDate, {
    onPage: ({ path, index, total, elapsed, scores }) => {
      const label = path || '/';
      const suffix = scores
        ? `perf ${scores.performance} · a11y ${scores.accessibility} · bp ${scores.bestPractices} · seo ${scores.seo}`
        : 'ok';
      console.error(`[${index}/${total}] ${label} — ${suffix} (${elapsed.toFixed(1)}s)`);
    },
  });

  console.log(JSON.stringify({ pagespeed }, null, 2));
}
