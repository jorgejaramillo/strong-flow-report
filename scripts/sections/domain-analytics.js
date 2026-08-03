#!/usr/bin/env node
/**
 * scripts/sections/domain-analytics.js — stats de dominio en el header
 *
 * Usa DataForSEO Domain Analytics API (domain_analytics/whois/overview) para
 * traer métricas orgánicas y de backlinks agregadas del dominio, en una
 * sola llamada (independiente de GSC). Se integran junto al resto de
 * REPORT_DATA.stats en el header del reporte.
 *
 * Requiere DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD en .env.
 *
 * Uso:
 *   node scripts/sections/domain-analytics.js <client>
 * Imprime a stdout: { "domainAnalytics": { ... } }
 */
import { loadClientConfig } from '../lib/config.js';
import { domainWhoisOverview } from '../lib/dataforseo.js';

export async function fetchDomainAnalytics(config) {
  const { item, cost } = await domainWhoisOverview({ domain: config.domain });

  if (!item) {
    return { domainAnalytics: null, _meta: { cost, found: false } };
  }

  const domainAnalytics = {
    organicKeywords: item.metrics?.organic?.count ?? null,
    organicTrafficValue: item.metrics?.organic?.etv != null ? Math.round(item.metrics.organic.etv) : null,
    backlinks: item.backlinks_info?.backlinks ?? null,
    referringDomains: item.backlinks_info?.referring_domains ?? null,
  };

  return { domainAnalytics, _meta: { cost, found: true } };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client] = process.argv;
  if (!client) {
    console.error('Uso: node scripts/sections/domain-analytics.js <client>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchDomainAnalytics(config);

  console.error(`Dominio encontrado en DataForSEO: ${result._meta.found} | costo DataForSEO: $${result._meta.cost.toFixed(4)}`);
  console.log(JSON.stringify({ domainAnalytics: result.domainAnalytics }, null, 2));
}
