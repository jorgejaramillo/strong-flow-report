import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

/** Lee clients/<slug>/config.json */
export function loadClientConfig(slug) {
  const path = join(ROOT, 'clients', slug, 'config.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export { ROOT };
