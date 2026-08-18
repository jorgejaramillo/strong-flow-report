#!/usr/bin/env node
/**
 * scripts/verify-gsc-site.js — confirma que clients/<slug>/.flow-cache.json
 * → gsc.siteUrl sea una propiedad verificada en Search Console (vía
 * list_sites). Un typo silencioso en gsc.siteUrl no falla ruidoso: GSC
 * simplemente devuelve cero filas y el reporte sale "vacío" sin error
 * visible — por eso conviene verificar esto antes de correr run-flow.js
 * para un cliente nuevo.
 *
 * Uso:
 *   node scripts/verify-gsc-site.js <slug>
 */
import { loadClientConfig } from './lib/config.js';
import { getAuthClient } from './lib/gsc.js';
import { listSites } from '../mcp-google-search-console/tools/sites.js';

const [, , slug] = process.argv;
if (!slug) {
  console.error('Uso: node scripts/verify-gsc-site.js <slug>');
  process.exit(1);
}

const config = loadClientConfig(slug);
const target = config.gsc?.siteUrl;
if (!target) {
  console.error(`clients/${slug}/.flow-cache.json no tiene gsc.siteUrl`);
  process.exit(1);
}

const auth = await getAuthClient();
const { sites } = await listSites(auth);
const match = sites.find(s => s.siteUrl === target);

if (match) {
  console.log(`✓ Verificada: "${target}" (permissionLevel: ${match.permissionLevel})`);
  process.exit(0);
}

console.error(`✗ NO ENCONTRADA: "${target}" no está entre las ${sites.length} propiedades de la cuenta.`);
const domainGuess = target.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
const similar = sites.filter(s => s.siteUrl.includes(domainGuess));
if (similar.length) {
  console.error('Propiedades similares en la cuenta:');
  for (const s of similar) console.error(`  - ${s.siteUrl} (${s.permissionLevel})`);
} else {
  console.error('No hay ninguna propiedad con ese dominio en la cuenta — verificar en Search Console.');
}
process.exit(1);
