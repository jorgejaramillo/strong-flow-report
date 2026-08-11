import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

/** Lee clients/<slug>/.flow-cache.json (poblado por scripts/sync-config.js) */
export function loadClientConfig(slug) {
  const cachePath = join(ROOT, 'clients', slug, '.flow-cache.json');
  if (!existsSync(cachePath)) {
    throw new Error(`No hay config cacheado para "${slug}" — corre "node scripts/sync-config.js ${slug}" primero.`);
  }
  const { data } = JSON.parse(readFileSync(cachePath, 'utf-8'));

  // Overrides locales para corregir problemas de permisos en GSC u otros
  if (slug === 'cafam' && data.gsc?.siteUrl === 'https://cafam.com.co/') {
    data.gsc.siteUrl = 'sc-domain:cafam.com.co';
  }

  return data;
}

export { ROOT };
