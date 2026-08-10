/**
 * Cliente mínimo para la API REST de DataForSEO (Basic Auth), usado por
 * los scripts de scripts/sections/ para llamar distintos endpoints de
 * DataForSEO sin pasar por el MCP.
 */
import { loadEnv } from './env.js';

const BASE_URL = 'https://api.dataforseo.com';

function authHeader() {
  loadEnv();
  const { DATAFORSEO_USERNAME, DATAFORSEO_PASSWORD } = process.env;
  if (!DATAFORSEO_USERNAME || !DATAFORSEO_PASSWORD) {
    throw new Error('Faltan DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD en .env');
  }
  return 'Basic ' + Buffer.from(`${DATAFORSEO_USERNAME}:${DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Llama /v3/ai_optimization/{llmType}/llm_responses/live y devuelve el texto
 * del primer mensaje de respuesta del modelo.
 */
export async function llmResponse({ llmType = 'chat_gpt', userPrompt, modelName, webSearch = true }) {
  const res = await fetch(`${BASE_URL}/v3/ai_optimization/${llmType}/llm_responses/live`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ user_prompt: userPrompt, model_name: modelName, web_search: webSearch }]),
  });
  const json = await res.json();
  if (!res.ok || json.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${json.status_message || res.status}`);
  }
  const task = json.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'sin resultado'}`);
  }
  const result = task.result?.[0];
  const message = result?.items?.find(i => i.type === 'message');
  const text = (message?.sections || []).map(s => s.text).filter(Boolean).join('\n');
  return { text, cost: task.cost || 0 };
}

/**
 * Llama /v3/dataforseo_labs/google/ranked_keywords/live y devuelve la
 * posición orgánica actual (rank_absolute) por keyword para el dominio
 * dado, filtrando solo a `keywords`. Las keywords que el dominio no rankea
 * (no aparecen en el índice de DataForSEO Labs) no vienen en el resultado
 * — quedan ausentes de `positionByKeyword`.
 */
export async function googleRankedKeywordPositions({ target, keywords, locationName, languageCode }) {
  const res = await fetch(`${BASE_URL}/v3/dataforseo_labs/google/ranked_keywords/live`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      target,
      location_name: locationName,
      language_code: languageCode,
      limit: Math.max(keywords.length, 1),
      filters: [['keyword_data.keyword', 'in', keywords]],
    }]),
  });
  const json = await res.json();
  if (!res.ok || json.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${json.status_message || res.status}`);
  }
  const task = json.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'sin resultado'}`);
  }
  const positionByKeyword = {};
  for (const item of task.result?.[0]?.items || []) {
    positionByKeyword[item.keyword_data.keyword] = item.ranked_serp_element?.serp_item?.rank_absolute ?? null;
  }
  return { positionByKeyword, cost: task.cost || 0 };
}

/**
 * Llama /v3/domain_analytics/whois/overview/live filtrado a un solo
 * dominio y devuelve su item (whois + backlinks + métricas orgánicas).
 * Devuelve null si el dominio no está en el índice de DataForSEO.
 */
export async function domainWhoisOverview({ domain }) {
  const res = await fetch(`${BASE_URL}/v3/domain_analytics/whois/overview/live`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ limit: 1, filters: [['domain', '=', domain]] }]),
  });
  const json = await res.json();
  if (!res.ok || json.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${json.status_message || res.status}`);
  }
  const task = json.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'sin resultado'}`);
  }
  const item = task.result?.[0]?.items?.[0] || null;
  return { item, cost: task.cost || 0 };
}
