#!/usr/bin/env node
/**
 * scripts/sections/robots.js — sección "Análisis de robots.txt"
 *
 * Fetch simple y directo de https://<domain>/robots.txt (sin GSC, sin
 * Cloudflare — es un archivo estático público). Guarda una copia local en
 * reports/<slug>/<reportDate>/data/robots.txt para que quede como evidencia
 * de esa corrida del reporte.
 *
 * Uso:
 *   node scripts/sections/robots.js <client> <reportDate YYYY-MM-DD>
 * Imprime a stdout: { "robotsTxt": { url, content, localPath } }
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';

/**
 * @param {object} config      clients/<slug>/config.json ya parseado
 * @param {string} reportDate  fecha del reporte (YYYY-MM-DD) — define la carpeta de salida
 */
export async function fetchRobots(config, reportDate) {
  const url = `https://${config.domain}/robots.txt`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${res.status})`);
  }
  const content = await res.text();

  const relOutDir = join('reports', config.slug, reportDate, 'data');
  mkdirSync(join(ROOT, relOutDir), { recursive: true });
  const localPath = join(relOutDir, 'robots.txt');
  writeFileSync(join(ROOT, localPath), content, 'utf-8');

  return { robotsTxt: { url, content, localPath } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/robots.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const { robotsTxt } = await fetchRobots(config, reportDate);

  console.error(`✓ ${robotsTxt.url} -> ${robotsTxt.localPath} (${robotsTxt.content.length} bytes)`);
  console.log(JSON.stringify({ robotsTxt }, null, 2));
}
