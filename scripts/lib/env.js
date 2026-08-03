import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ROOT } from './config.js';

let loaded = false;

/** Carga .env (raíz del repo) en process.env, sin pisar variables ya seteadas. */
export function loadEnv() {
  if (loaded) return;
  const path = join(ROOT, '.env');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
  loaded = true;
}
