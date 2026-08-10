import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ROOT } from './lib/config.js';

const FLOW_URL = 'https://flow.jorgejaramillo.com/api/config';

const slug = process.argv[2];
if (!slug) {
  console.error('Uso: node scripts/sync-config.js <slug>');
  process.exit(1);
}

const keyPath = join(ROOT, 'clients', slug, 'config.json');
if (!existsSync(keyPath)) {
  console.error(`Falta clients/${slug}/config.json con { "config_api_key": "sk_live_..." }`);
  process.exit(1);
}
const { config_api_key: apiKey } = JSON.parse(readFileSync(keyPath, 'utf-8'));
if (!apiKey) {
  console.error(`clients/${slug}/config.json no tiene "config_api_key"`);
  process.exit(1);
}

const cachePath = join(ROOT, 'clients', slug, '.flow-cache.json');
const cached = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf-8')) : null;

// Cloudflare a veces comprime la respuesta y debilita el ETag (agrega el
// prefijo W/), pero Flow solo reconoce la forma fuerte al comparar
// If-None-Match — se le quita el prefijo antes de reenviarlo.
const ifNoneMatch = cached?.etag?.replace(/^W\//, '');

const res = await fetch(FLOW_URL, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
  },
});

if (res.status === 304) {
  console.error(`Config sin cambios (v${cached.version}) — usando cache.`);
  process.exit(0);
}
if (res.status === 401) {
  console.error('API key inválida o revocada en Flow.');
  process.exit(1);
}
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  console.error(`Error al traer config de Flow: ${body.error?.message || res.statusText}`);
  process.exit(1);
}

const etag = res.headers.get('ETag');
const { version, data } = await res.json();
writeFileSync(cachePath, JSON.stringify({ version, etag, data, fetchedAt: new Date().toISOString() }, null, 2));

if (!data.site.active) {
  console.error(`Aviso: el cliente "${slug}" está inactivo (site.active=false) en Flow.`);
}
console.error(`Config sincronizado: ${slug} (v${version})`);
