#!/usr/bin/env node
/**
 * scripts/sections/header.js — sección "Meta, Header Badges y Stats"
 *
 * Genera el fragmento de data.json con el resumen del período actual vs anterior
 * y estadísticas globales del sitemap.
 *
 * Uso:
 *   node scripts/sections/header.js <client> <reportDate YYYY-MM-DD>
 */
import { loadClientConfig } from '../lib/config.js';
import { lastNDays, previousPeriod, formatDateEs } from '../lib/dates.js';
import { getAuthClient, getSearchAnalytics, listSitemaps } from '../lib/gsc.js';

async function fetchHeader(config, reportDate) {
  const windowDays = config.keywords?.days || 28;
  const currentRange = lastNDays(windowDays, { today: reportDate });
  const prevRange = previousPeriod(currentRange);

  const auth = await getAuthClient();
  const siteUrl = config.gsc.siteUrl;

  // 1. Analytics actual vs anterior
  const current = await getSearchAnalytics(auth, {
    siteUrl,
    startDate: currentRange.startDate,
    endDate: currentRange.endDate,
    dimensions: ['device'],
  });

  const previous = await getSearchAnalytics(auth, {
    siteUrl,
    startDate: prevRange.startDate,
    endDate: prevRange.endDate,
    dimensions: ['device'],
  });

  // Helper to aggregate rows
  const aggregate = (result) => {
    const totals = { clicks: 0, impressions: 0, position: 0 };
    if (!result.rows || result.rows.length === 0) return totals;
    
    result.rows.forEach(r => {
      totals.clicks += r.clicks;
      totals.impressions += r.impressions;
      totals.position += (r.position * r.impressions); // Weighted average for position
    });
    totals.position = totals.position / totals.impressions;
    return totals;
  };

  const currentTotals = aggregate(current);
  const prevTotals = aggregate(previous);

  // 2. Sitemap stats
  const sitemapResult = await listSitemaps(auth, { siteUrl });
  const globalStats = sitemapResult.globalStats || {
    totalSubmitted: 0, sitemapsWithErrors: 0, sitemapsWithWarnings: 0,
  };

  // 3. Formateo de meta
  const meta = {
    clientSlug: config.slug,
    clientName: config.name,
    domain: config.domain,
    periodStart: formatDateEs(currentRange.startDate),
    periodEnd: formatDateEs(currentRange.endDate),
    generatedAt: formatDateEs(reportDate),
    pagesAnalyzed: config.crawl.maxPages,
  };

  // 4. Formateo de stats y badges
  const diffClicks = currentTotals.clicks - prevTotals.clicks;
  const pctClicks = prevTotals.clicks > 0 ? (diffClicks / prevTotals.clicks) * 100 : 0;
  const diffImpressions = currentTotals.impressions - prevTotals.impressions;
  const pctImpressions = prevTotals.impressions > 0 ? (diffImpressions / prevTotals.impressions) * 100 : 0;
  
  const currentCtr = (currentTotals.clicks / currentTotals.impressions) * 100;
  const prevCtr = (prevTotals.clicks / prevTotals.impressions) * 100;
  const diffCtr = currentCtr - prevCtr;

  const diffPos = currentTotals.position - prevTotals.position; // En posición, menos es mejor

  const headerBadges = [
    {
      text: `${pctClicks >= 0 ? '↑' : '↓'} ${Math.abs(pctClicks).toFixed(1)}% clicks`,
      class: pctClicks >= 0 ? 'badge-success' : 'badge-error',
    },
    {
      text: `${globalStats.totalSubmitted} URLs en sitemap`,
      class: 'badge-info',
    }
  ];

  const stats = [
    {
      title: 'Clicks',
      value: currentTotals.clicks.toLocaleString(),
      valueClass: 'text-primary',
      desc: `${pctClicks >= 0 ? '↑' : '↓'} ${Math.abs(pctClicks).toFixed(1)}% vs período anterior`,
      descClass: pctClicks >= 0 ? 'text-success' : 'text-error',
    },
    {
      title: 'Impresiones',
      value: currentTotals.impressions.toLocaleString(),
      desc: `${pctImpressions >= 0 ? '↑' : '↓'} ${Math.abs(pctImpressions).toFixed(1)}%`,
      descClass: pctImpressions >= 0 ? 'text-success' : 'text-error',
    },
    {
      title: 'CTR medio',
      value: `${currentCtr.toFixed(2)}%`,
      desc: `${diffCtr >= 0 ? '↑' : '↓'} ${Math.abs(diffCtr).toFixed(2)}pp`,
      descClass: diffCtr >= 0 ? 'text-success' : 'text-error',
    },
    {
      title: 'Posición media',
      value: currentTotals.position.toFixed(1),
      desc: `${diffPos <= 0 ? '↑' : '↓'} ${Math.abs(diffPos).toFixed(1)} (mejor)`,
      descClass: diffPos <= 0 ? 'text-success' : 'text-error',
    },
    {
      title: 'URLs encontradas',
      value: globalStats.totalSubmitted.toLocaleString(),
      desc: 'Vía sitemap.xml',
    },
    {
      title: 'URLs enviadas',
      value: globalStats.totalSubmitted.toLocaleString(),
      desc: 'A Search Console',
    }
  ];

  return { meta, headerBadges, stats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , client, reportDate] = process.argv;
  if (!client || !reportDate) {
    console.error('Uso: node scripts/sections/header.js <client> <reportDate YYYY-MM-DD>');
    process.exit(1);
  }

  const config = loadClientConfig(client);
  const result = await fetchHeader(config, reportDate);
  console.log(JSON.stringify(result, null, 2));
}
