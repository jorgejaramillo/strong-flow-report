#!/usr/bin/env node
/**
 * scripts/run-flow.js — corre todos los pasos automatizables del Flow para
 * un cliente, en orden, mergeando cada resultado en data.json y mostrando
 * avance + tiempo por tarea en terminal.
 *
 * Uso:
 *   node scripts/run-flow.js <slug> [reportDate YYYY-MM-DD] [--fresh]
 *
 * Resume por defecto: si un paso ya escribió sus keys en data.json (de una
 * corrida anterior, completa o interrumpida), se saltea en vez de repetirse
 * — así una corrida que se cortó a la mitad (o falló en un paso) puede
 * volver a lanzarse igual y solo hace el trabajo que falta. `--fresh`
 * ignora ese cache y re-corre las 12 secciones desde cero.
 *
 * Pasos que este script NO cubre (quedan pendientes, ver resumen final):
 *   - aiActions: requiere el skill `analista` sobre el HTML que descarga
 *     el paso landingsCrawl.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { clearLine, cursorTo } from 'readline';
import { ROOT } from './lib/config.js';

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const [slug, reportDateArg] = args.filter(a => a !== '--fresh');
if (!slug) {
  console.error('Uso: node scripts/run-flow.js <slug> [reportDate YYYY-MM-DD] [--fresh]');
  process.exit(1);
}
const reportDate = reportDateArg || new Date().toISOString().slice(0, 10);

const STEPS = [
  { name: 'header', script: 'header.js', args: [slug, reportDate], outputKeys: ['meta', 'headerBadges', 'stats'] },
  { name: 'domainAnalytics', script: 'domain-analytics.js', args: [slug], outputKeys: ['domainAnalytics'] },
  { name: 'clicksOverTime', script: 'clicks-over-time.js', args: [slug, reportDate], outputKeys: ['clicksOverTime'] },
  { name: 'cannibalization', script: 'cannibalization.js', args: [slug], outputKeys: ['cannibalization'] },
  { name: 'landingsDelta', script: 'landings-delta.js', args: [slug, reportDate], outputKeys: ['winners', 'losers', 'landingsPeriodLabel'] },
  { name: 'landingsCrawl', script: 'landings-crawl.js', args: [slug, reportDate], outputKeys: ['landingsCrawl'] },
  { name: 'findings', script: 'findings.js', args: [slug, reportDate], requires: 'landingsCrawl', outputKeys: ['findings'] },
  { name: 'contentImprove', script: 'content-improve.js', args: [slug, reportDate], requires: 'landingsCrawl', outputKeys: ['contentImprove'] },
  { name: 'keywords', script: 'keywords.js', args: [slug, reportDate], outputKeys: ['keywords'] },
  { name: 'sitemap', script: 'sitemap.js', args: [slug], outputKeys: ['sitemap'] },
  { name: 'robotsTxt', script: 'robots.js', args: [slug, reportDate], outputKeys: ['robotsTxt'] },
  { name: 'keywordVolume', script: 'keyword-volume.js', args: [slug, reportDate], outputKeys: ['keywordVolume'] },
];
const LABEL_WIDTH = Math.max(...STEPS.map(s => s.name.length)) + 2;

const reportDir = join(ROOT, 'reports', slug, reportDate);
mkdirSync(reportDir, { recursive: true });
const dataPath = join(reportDir, 'data.json');
const data = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf-8')) : {};
const saveData = () => writeFileSync(dataPath, JSON.stringify(data, null, 2));

const isTTY = !!process.stdout.isTTY;

// En una terminal interactiva, "running" se sobreescribe con el resultado
// en la misma línea. Fuera de una TTY (redirigido a archivo, corrido por
// Claude, etc.) no hay overwrite: cada estado se imprime como línea aparte
// para no dejar códigos ANSI sueltos en la salida.
function write(line) {
  if (isTTY) {
    clearLine(process.stdout, 0);
    cursorTo(process.stdout, 0);
    process.stdout.write(line);
  } else if (line.trim()) {
    process.stdout.write(line.endsWith('\n') ? line : `${line}\n`);
  }
}

function fmt(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function runNode(scriptFile, args, isSection = true) {
  const t0 = Date.now();
  const scriptPath = isSection ? join(ROOT, 'scripts', 'sections', scriptFile) : join(ROOT, 'scripts', scriptFile);
  const res = spawnSync('node', [scriptPath, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  return { ...res, elapsed: (Date.now() - t0) / 1000 };
}

console.log(`Flow — ${slug} — ${reportDate}\n`);

// Paso 0: sync-config (obligatorio, aborta el flow si falla)
// Paso 0: sync-config (obligatorio, aborta el flow si falla)
write('sync-config'.padEnd(LABEL_WIDTH, '.') + ' running...');
const syncRes = runNode('sync-config.js', [slug], false);
if (syncRes.status !== 0) {
  write('sync-config'.padEnd(LABEL_WIDTH, '.') + ` FAILED (${fmt(syncRes.elapsed)})\n`);
  console.error(syncRes.stderr.trim());
  process.exit(1);
}
write('sync-config'.padEnd(LABEL_WIDTH, '.') + ` ok (${fmt(syncRes.elapsed)})\n`);

const cachePath = join(ROOT, 'clients', slug, '.flow-cache.json');
const clientConfig = JSON.parse(readFileSync(cachePath, 'utf-8')).data;
if (!clientConfig.site?.active) {
  console.error(`\nCliente "${slug}" está inactivo (site.active=false) en Flow — no se genera el reporte.`);
  process.exit(1);
}

// Pasos de secciones
const t0Total = Date.now();
const failed = [];
const skipped = [];
const reused = [];

for (const [i, step] of STEPS.entries()) {
  const prefix = `[${i + 1}/${STEPS.length}] ${step.name}`.padEnd(LABEL_WIDTH + 8, '.');

  if (!fresh && step.outputKeys.every(k => data[k] !== undefined)) {
    write(`${prefix} ya hecho (cache)\n`);
    reused.push(step.name);
    continue;
  }

  if (step.requires) {
    const dep = data[step.requires];
    const depOk = Array.isArray(dep) ? dep.length > 0 : !!dep;
    if (!depOk) {
      write(`${prefix} skipped (falta ${step.requires})\n`);
      skipped.push({ name: step.name, reason: `falta ${step.requires}` });
      continue;
    }
  }

  write(`${prefix} running...`);
  const res = runNode(step.script, step.args);

  if (res.status !== 0) {
    write(`${prefix} FAILED (${fmt(res.elapsed)})\n`);
    failed.push({ name: step.name, error: res.stderr.trim().split('\n').slice(-3).join(' | ') });
    continue;
  }

  try {
    const parsed = JSON.parse(res.stdout);
    Object.assign(data, parsed);
    saveData();
  } catch {
    write(`${prefix} FAILED (${fmt(res.elapsed)})\n`);
    failed.push({ name: step.name, error: 'salida no es JSON válido' });
    continue;
  }

  write(`${prefix} ok (${fmt(res.elapsed)})\n`);
}

const totalElapsed = (Date.now() - t0Total) / 1000;

console.log('\nGenerando report.html...');
const buildRes = runNode('build-report.js', [slug, reportDate], false);
if (buildRes.status !== 0) {
  console.error(buildRes.stderr.trim());
} else {
  console.log(buildRes.stdout.trim());
}

// Resumen
console.log(`\nTiempo total secciones: ${fmt(totalElapsed)}`);
if (reused.length) {
  console.log(`Reusados de data.json (sin re-correr): ${reused.join(', ')}`);
}
if (failed.length) {
  console.log(`\nFallaron ${failed.length} paso(s):`);
  for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
}
if (skipped.length) {
  console.log(`\nSe saltaron ${skipped.length} paso(s):`);
  for (const s of skipped) console.log(`  - ${s.name}: ${s.reason}`);
}
console.log('\nPendiente manual: aiActions (skill `analista` sobre reports/' + slug + '/' + reportDate + '/data/crawl/)');
