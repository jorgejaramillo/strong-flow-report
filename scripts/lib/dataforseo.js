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
 * Llama /v3/keywords_data/google_ads/search_volume/live y devuelve el
 * volumen de búsqueda mensual promedio por keyword. Las keywords sin datos
 * suficientes en Google Ads no vienen en el resultado — quedan ausentes de
 * `volumeByKeyword`.
 */
export async function googleKeywordSearchVolume({ keywords, locationName, languageCode }) {
  const res = await fetch(`${BASE_URL}/v3/keywords_data/google_ads/search_volume/live`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keywords,
      location_name: locationName,
      language_code: languageCode,
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
  const volumeByKeyword = {};
  for (const item of task.result || []) {
    volumeByKeyword[item.keyword] = item.search_volume ?? null;
  }
  return { volumeByKeyword, cost: task.cost || 0 };
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
