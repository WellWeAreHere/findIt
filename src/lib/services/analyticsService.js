// Admin dashboard data. Counts that must be authoritative (status,
// recoveries, claims) come from MySQL; attribute-level analytics (colours,
// brands, tags) and trend aggregations come from MongoDB pipelines.
import * as analytics from '../repositories/analytics.js';
import * as itemDetails from '../repositories/mongo/itemDetails.js';
import * as activity from '../repositories/mongo/activity.js';
import * as syncService from './syncService.js';

const settle = async (promise, fallback) => {
  try { return await promise; } catch (err) { console.warn('[analytics]', err.message); return fallback; }
};

export async function dashboard() {
  const [totals, byCategory, hotspots, oldest, unmatched, auditTrail, sync] = await Promise.all([
    analytics.totals(),
    analytics.recoveryByCategory(),
    analytics.hotspots(2),
    analytics.oldestUnresolved(8),
    analytics.unmatchedLost(8),
    analytics.recentActivity(15),
    syncService.status(),
  ]);

  // MongoDB being down must not take the dashboard down with it.
  const [monthly, lostByCategory, byBuilding, colours, brands, tags, events] = await Promise.all([
    settle(itemDetails.monthlyTrend(6), []),
    settle(itemDetails.lostByCategory(), []),
    settle(itemDetails.reportsByBuilding(), []),
    settle(itemDetails.topAttributeValues(['color', 'strap_color', 'frame_color', 'keychain_color', 'case_color']), []),
    settle(itemDetails.topAttributeValues(['brand']), []),
    settle(itemDetails.topTags(15), []),
    settle(activity.recent(15), []),
  ]);

  const numeric = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v ?? 0)]));
  return {
    totals: numeric,
    recoveryByCategory: byCategory,
    hotspots,
    oldestUnresolved: oldest,
    unmatchedLost: unmatched,
    auditTrail,
    sync,
    mongo: { monthly, lostByCategory, byBuilding, colours, brands, tags, recentEvents: events },
  };
}

export const recoverySummary = (from, to) => analytics.recoverySummary(from, to);
