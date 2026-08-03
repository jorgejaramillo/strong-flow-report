/**
 * Wrappers finos sobre el código del MCP de Google Search Console
 * (mcp-google-search-console/), reusado como módulos Node normales
 * en vez de pasar por el protocolo MCP.
 */
import { getAuthClient } from '../../mcp-google-search-console/auth.js';
import { getSearchAnalytics } from '../../mcp-google-search-console/tools/search-analytics.js';
import { listSitemaps } from '../../mcp-google-search-console/tools/sitemaps.js';

export { getAuthClient, getSearchAnalytics, listSitemaps };

/**
 * Serie diaria de Search Analytics (dimensión "date").
 * El wrapper del MCP (tools/search-analytics.js) solo admite
 * query|page|device|country, así que esta función llama la REST API de GSC
 * directamente con el access token del authClient — sin depender del paquete
 * "googleapis" (que solo está instalado dentro de mcp-google-search-console/,
 * no en la raíz de este repo).
 */
export async function getSearchAnalyticsByDate(auth, { siteUrl, startDate, endDate, rowLimit = 25000 }) {
  const { token } = await auth.getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions: ['date'], rowLimit, dataState: 'all' }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GSC API error (${res.status}): ${json.error?.message || JSON.stringify(json)}`);
  }
  const rows = (json.rows || []).map(r => ({
    date: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
  }));
  return { rows };
}
