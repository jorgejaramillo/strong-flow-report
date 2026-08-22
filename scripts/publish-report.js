#!/usr/bin/env node
/**
 * scripts/publish-report.js — sube un reporte completo a Cloudflare R2
 *
 * Publica TODA la carpeta reports/<slug>/<date>/ (report.html, data.json,
 * y data/ con el HTML crawleado, sitemaps y robots.txt) — no solo
 * report.html, porque el HTML tiene links relativos a esos archivos (ej.
 * el botón "ver HTML descargado" de la sección Landings) que quedarían
 * rotos si no se suben también.
 *
 * El bucket flow-reports tiene acceso público habilitado (URL *.r2.dev) —
 * R2 no tiene ACL por objeto, así que todo lo que haya ahí es público.
 * Servir el reporte con login real es trabajo de flow-app
 * (/Users/jorgejaramillo/Documents/Github/flow-app) más adelante — no es
 * parte de este repo.
 *
 * No está integrado al pipeline `flow` / run-flow.js a propósito: es un
 * paso manual aparte, después de generar el reporte.
 *
 * Requiere en .env: CF_ACCOUNT_ID, CF_R2_API_TOKEN (token con permiso
 * "Workers R2 Storage: Edit" — separado del CF_API_TOKEN que usa
 * Browser Rendering, que no sirve para esto), CF_R2_BUCKET,
 * CF_R2_PUBLIC_URL (la URL *.r2.dev del bucket).
 *
 * Uso:
 *   node scripts/publish-report.js <client> [reportDate YYYY-MM-DD]
 * Si se omite reportDate, publica la corrida más reciente que exista en
 * reports/<client>/ (la carpeta con fecha más alta que tenga report.html).
 */
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { spawnSync } from 'child_process';
import { clearLine, cursorTo } from 'readline';
import { ROOT } from './lib/config.js';
import { loadEnv } from './lib/env.js';

/** Última fecha (carpeta) con report.html dentro de reports/<client>/. */
function findLatestReportDate(client) {
  const clientDir = join(ROOT, 'reports', client);
  if (!existsSync(clientDir)) {
    throw new Error(`No existe reports/${client}/ — corré build-report.js (o el pipeline flow) primero.`);
  }
  const dates = readdirSync(clientDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(clientDir, e.name, 'report.html')))
    .map(e => e.name)
    .sort();
  if (dates.length === 0) {
    throw new Error(`No hay ningún reporte generado (report.html) en reports/${client}/ — corré build-report.js primero.`);
  }
  return dates[dates.length - 1];
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

function contentTypeFor(file) {
  return CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
}

/** Enumera todos los archivos (recursivo) bajo dir, devuelve paths absolutos. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

/**
 * @param {object} [opts]
 * @param {(done: number, total: number) => void} [opts.onProgress] — se llama después de cada archivo (suba o falle)
 */
export async function publishReport(client, reportDate, opts = {}) {
  loadEnv();
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_R2_API_TOKEN;
  const bucket = process.env.CF_R2_BUCKET;
  const publicUrl = process.env.CF_R2_PUBLIC_URL;
  if (!accountId || !apiToken || !bucket || !publicUrl) {
    throw new Error('Faltan CF_ACCOUNT_ID / CF_R2_API_TOKEN / CF_R2_BUCKET / CF_R2_PUBLIC_URL en .env');
  }

  const reportDir = join(ROOT, 'reports', client, reportDate);
  const reportHtmlPath = join(reportDir, 'report.html');
  if (!existsSync(reportHtmlPath)) {
    throw new Error(`No existe ${relative(ROOT, reportHtmlPath)} — corré build-report.js (o el pipeline flow) primero.`);
  }

  const files = listFiles(reportDir);
  const keyPrefix = `${client}/${reportDate}`;
  const env = { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId };

  let totalBytes = 0;
  const uploaded = [];
  const failed = [];

  for (const abs of files) {
    const relPath = relative(reportDir, abs).split('\\').join('/'); // por si corre en Windows
    const key = `${keyPrefix}/${relPath}`;
    const res = spawnSync('npx', [
      'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
      '--file', abs,
      '--content-type', contentTypeFor(abs),
      '--remote',
    ], { cwd: ROOT, env, encoding: 'utf-8' });

    if (res.status !== 0) {
      failed.push({ key, error: (res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' | ') });
    } else {
      totalBytes += statSync(abs).size;
      uploaded.push(key);
    }
    opts.onProgress?.(uploaded.length + failed.length, files.length);
  }

  const published = {
    bucket, keyPrefix,
    url: `${publicUrl}/${keyPrefix}/report.html`,
    publishedAt: new Date().toISOString(),
    fileCount: uploaded.length,
    totalBytes,
  };

  if (failed.length === 0) {
    const dataPath = join(reportDir, 'data.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.published = published;
    writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
  }

  return { published, uploaded, failed };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDateArg] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/publish-report.js <client> [reportDate YYYY-MM-DD]');
    process.exit(1);
  }

  const reportDate = reportDateArg || findLatestReportDate(client);

  const isTTY = !!process.stderr.isTTY;
  function writeProgress(done, total) {
    const line = `Subiendo... (${done}/${total})`;
    if (isTTY) {
      clearLine(process.stderr, 0);
      cursorTo(process.stderr, 0);
      process.stderr.write(line);
    } else if (done === total) {
      process.stderr.write(`${line}\n`);
    }
  }

  const { published, failed } = await publishReport(client, reportDate, { onProgress: writeProgress });
  if (isTTY) { clearLine(process.stderr, 0); cursorTo(process.stderr, 0); }

  if (failed.length > 0) {
    for (const f of failed) console.error(`✗ ${f.key} (${f.error})`);
    console.error(`${failed.length} archivo(s) fallaron — no se actualizó data.json.`);
    process.exit(1);
  }

  console.log(published.url);
}
