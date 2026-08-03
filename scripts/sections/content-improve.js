#!/usr/bin/env node
/**
 * scripts/sections/content-improve.js — sección "Hallazgos: Contenido para mejorar"
 *
 * Usa DataForSEO AI Optimization API (ai_optimization_llm_response, ChatGPT
 * con web_search habilitado) para preguntarle a un LLM qué subtemas
 * esperaría un usuario real al buscar el tema de cada seed URL del cliente,
 * y cruza esa respuesta contra el texto ya crawleado de esa página
 * (landingsCrawl) para detectar subtemas que la IA menciona pero que el
 * contenido actual no cubre.
 *
 * Requiere que landingsCrawl ya esté en reports/<slug>/<reportDate>/data.json
 * (correr primero scripts/sections/landings-crawl.js) y credenciales
 * DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD en .env.
 *
 * Uso:
 *   node scripts/sections/content-improve.js <client> <reportDate YYYY-MM-DD>
 * Imprime a stdout: { "contentImprove": [{ page, detail }, ...] }
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadClientConfig, ROOT } from '../lib/config.js';
import { llmResponse } from '../lib/dataforseo.js';
import { extractFromHtml } from '../../mcp-google-search-console/scrapping/scripts/extract-text.js';

const MODEL_NAME = 'gpt-5-mini';
const MAX_PAGES = 8;
const MAX_FINDINGS_PER_PAGE = 2;
const MAX_FINDINGS = 10;

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parsea la respuesta del LLM (lista numerada o con guiones) en subtemas individuales */
function splitSubtopics(text) {
  return text
    .split('\n')
    .map(line => line.replace(/^[\s\d.\-•]+/, '').trim())
    .filter(line => line.length > 10);
}

/** true si menos de la mitad de las palabras clave (>3 letras) del subtema aparecen en el texto de la página */
function isSubtopicMissing(subtopic, wordSetPadded) {
  const tokens = normalize(subtopic).split(' ').filter(t => t.length > 3);
  if (tokens.length === 0) return false;
  const present = tokens.filter(t => wordSetPadded.includes(` ${t} `)).length;
  return present / tokens.length < 0.5;
}

/**
 * @param {object} config          clients/<slug>/config.json ya parseado
 * @param {Array<{url:string, localPath:string}>} landingsCrawl  salida de landings-crawl.js
 */
export async function fetchContentImprove(config, landingsCrawl) {
  const countryLabel = config.site?.country ? ` en ${config.site.country.toUpperCase()}` : '';
  const candidates = [];
  let totalCost = 0;

  const pages = landingsCrawl.filter(l => l.localPath).slice(0, MAX_PAGES);

  for (const { url, localPath } of pages) {
    let html;
    try {
      html = readFileSync(join(ROOT, localPath), 'utf-8');
    } catch {
      continue; // archivo no disponible localmente, se salta
    }
    const extracted = extractFromHtml(html);
    const topic = extracted.headings?.h1?.[0] || extracted.title || url;
    const wordSetPadded = ` ${extracted.wordSet.join(' ')} `;

    const prompt = `Como usuario${countryLabel} investigando "${topic}", ¿qué 5 preguntas o subtemas esperarías que una página completa sobre ese tema responda? Responde solo la lista, en español, sin explicaciones extra.`;

    let text, cost;
    try {
      ({ text, cost } = await llmResponse({ llmType: 'chat_gpt', userPrompt: prompt, modelName: MODEL_NAME, webSearch: true }));
    } catch (err) {
      console.error(`content-improve: fallo en ${url}: ${err.message}`);
      continue;
    }
    totalCost += cost;

    let foundForPage = 0;
    for (const subtopic of splitSubtopics(text)) {
      if (foundForPage >= MAX_FINDINGS_PER_PAGE) break;
      if (!isSubtopicMissing(subtopic, wordSetPadded)) continue;

      candidates.push({
        page: url,
        detail: `<strong>${subtopic}</strong><br><span class="text-xs text-base-content/50">No está cubierta en el contenido actual de la página.</span>`,
        source: 'ChatGPT',
      });
      foundForPage++;
    }
  }

  const contentImprove = candidates.slice(0, MAX_FINDINGS);
  return { contentImprove, _meta: { pagesAnalyzed: pages.length, candidatesFound: candidates.length, cost: totalCost } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/content-improve.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const dataPath = join(ROOT, 'reports', client, reportDate, 'data.json');
  const existingData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const landingsCrawl = existingData.landingsCrawl;
  if (!landingsCrawl || landingsCrawl.length === 0) {
    console.error(`No hay landingsCrawl en ${dataPath}. Corre primero: node scripts/sections/landings-crawl.js ${client} ${reportDate}`);
    process.exit(1);
  }

  const result = await fetchContentImprove(config, landingsCrawl);

  console.error(`Páginas analizadas: ${result._meta.pagesAnalyzed} | candidatos encontrados: ${result._meta.candidatesFound} | mostrando: ${result.contentImprove.length} | costo DataForSEO: $${result._meta.cost.toFixed(4)}`);
  console.log(JSON.stringify({ contentImprove: result.contentImprove }, null, 2));
}
