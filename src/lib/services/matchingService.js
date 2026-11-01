// Finds potential matches for a report and stores them in MySQL.
//
// 1. Candidates (MySQL): opposite type, different owner, open, within 30
//    days, same category OR returned by a MongoDB $text search on this
//    report's tags. SQL functions supply category/location/date scores.
// 2. Details (MongoDB): tokens and characteristics for both sides.
// 3. Score with the active scorer; upsert pairs >= STORE_THRESHOLD
//    (unique (lost, found) key = no duplicates), drop stale suggestions,
//    notify both owners of new strong matches - all in one transaction.
import { query, transaction, withConnection } from '../db/mysql.js';
import * as reports from '../repositories/reports.js';
import * as matches from '../repositories/matches.js';
import * as itemDetails from '../repositories/mongo/itemDetails.js';
import * as templates from '../repositories/mongo/templates.js';
import * as activity from '../repositories/mongo/activity.js';
import { notifyMany } from './notificationService.js';
import { activeScorer, NOTIFY_THRESHOLD, STORE_THRESHOLD } from '../matching/scorer.js';
import { badRequest, notFound } from '../errors.js';

async function loadReport(reportId) {
  return (await query(
    `SELECT r.report_id, r.user_id, r.report_type, r.item_id, r.location_id, r.report_date, r.status,
            i.category_id, i.item_name
     FROM reports r JOIN items i ON i.item_id = r.item_id WHERE r.report_id = ?`,
    [reportId],
  ))[0] ?? null;
}

export async function runForReport(reportId, { includeResolved = false } = {}) {
  const report = await loadReport(reportId);
  if (!report) throw notFound('Report not found');
  if (report.status !== 'OPEN' && !includeResolved) return { candidates: 0, stored: 0, notified: 0 };

  const doc = await itemDetails.findOne(reportId);
  if (!doc) return { candidates: 0, stored: 0, notified: 0, skipped: 'details not synced yet' };

  const opposite = report.report_type === 'LOST' ? 'FOUND' : 'LOST';
  const searchText = [...new Set([report.item_name, ...doc.search_tags])].join(' ');
  const textHits = await itemDetails.textSearch(searchText, { reportType: opposite, limit: 50 });

  const candidates = await reports.matchCandidates({
    report, extraIds: textHits.map((h) => h.report_id), includeResolved,
  });
  const docs = new Map((await itemDetails.findMany(candidates.map((c) => c.report_id)))
    .map((d) => [d.report_id, d]));
  const templateDocs = await templates.forCategories([...new Set([doc.category_id, ...[...docs.values()].map((d) => d.category_id)])]);
  const fieldsByCategory = new Map(templateDocs.map((t) => [t.category_id, t.fields]));

  const existing = new Map((await matches.existingPairs(reportId))
    .map((m) => [`${m.lost_report_id}:${m.found_report_id}`, m.match_status]));

  const results = [];
  for (const c of candidates) {
    const otherDoc = docs.get(c.report_id);
    if (!otherDoc) continue;
    const self = { doc, report_date: report.report_date };
    const other = { doc: otherDoc, report_date: c.report_date };
    const [lost, found] = report.report_type === 'LOST' ? [self, other] : [other, self];
    const lostReport = report.report_type === 'LOST' ? report : c;
    const foundReport = report.report_type === 'LOST' ? c : report;
    // Same category: that category's weights; otherwise union, lost side first.
    const fields = [...(fieldsByCategory.get(lost.doc.category_id) ?? []), ...(fieldsByCategory.get(found.doc.category_id) ?? [])];
    const scored = activeScorer.score({
      lost, found, fields,
      sql: { category: c.category_score, location: c.location_score, date: c.date_score },
    });
    results.push({ lostReport, foundReport, scored, bothOpen: report.status === 'OPEN' && c.status === 'OPEN' });
  }

  let stored = 0;
  let notified = 0;
  await transaction(async (conn) => {
    const notes = [];
    for (const { lostReport, foundReport, scored, bothOpen } of results) {
      const key = `${lostReport.report_id}:${foundReport.report_id}`;
      if (scored.total < STORE_THRESHOLD) {
        if (existing.get(key) === 'SUGGESTED') await matches.removeSuggestion(conn, lostReport.report_id, foundReport.report_id);
        continue;
      }
      const affected = await matches.upsert(conn, {
        lost_report_id: lostReport.report_id,
        found_report_id: foundReport.report_id,
        ...scored.components,
        matched: scored.matched,
        algorithm_version: activeScorer.version,
      });
      stored += 1;
      const isNew = affected === 1 && !existing.has(key);
      if (isNew && bothOpen && scored.total >= NOTIFY_THRESHOLD) {
        notified += 1;
        const pct = Math.round(scored.total);
        notes.push(
          { user_id: lostReport.user_id, related_report_id: lostReport.report_id, notification_type: 'MATCH_FOUND',
            message: `A found ${foundReport.item_name} looks like your lost item (${pct}% match).` },
          { user_id: foundReport.user_id, related_report_id: foundReport.report_id, notification_type: 'MATCH_FOUND',
            message: `The ${foundReport.item_name} you found may belong to someone who reported it lost (${pct}% match).` },
        );
      }
    }
    await notifyMany(conn, notes);
  });

  await activity.logQuietly(reportId, 'MATCH_RUN', null, {
    algorithm: activeScorer.version, candidates: candidates.length, stored,
    best: results.length ? Math.max(...results.map((r) => r.scored.total)) : null,
  });
  return { candidates: candidates.length, stored, notified };
}

// Recomputes matches for every report (used after seeding and from the
// admin dashboard when weights or templates change).
export async function rematchAll({ includeResolved = false } = {}) {
  const ids = (await query(
    `SELECT report_id FROM reports ${includeResolved ? '' : "WHERE status = 'OPEN'"} ORDER BY report_id`,
  )).map((r) => r.report_id);
  let notifiedPairs = 0;
  for (const id of ids) notifiedPairs += (await runForReport(id, { includeResolved })).notified;
  // Pairs whose claim was already approved are confirmed history.
  await withConnection((conn) => matches.confirmApprovedPairs(conn));
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM matches');
  return { reports: ids.length, matches: n, notifiedPairs };
}

export async function review(admin, matchId, status) {
  const match = await matches.findById(matchId);
  if (!match) throw notFound('Match not found');
  if (match.match_status === status) return match;
  if (match.match_status === 'CONFIRMED' && status !== 'CONFIRMED') {
    throw badRequest('A confirmed match cannot be changed');
  }
  await withConnection((conn) => matches.setStatus(conn, matchId, status, admin.user_id), { userId: admin.user_id });
  return matches.findById(matchId);
}

export const forReport = (reportId) => matches.forReport(reportId);
export const forUser = (userId) => matches.forUser(userId);
export const adminList = (filters) => matches.adminList(filters);
