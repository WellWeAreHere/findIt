// MySQL -> MongoDB consistency.
//
// Strategy: MySQL first, transactional outbox, idempotent upserts.
//   1. The report row and an outbox entry are written in ONE MySQL
//      transaction (reportService).
//   2. pushReport() applies the entry to MongoDB (upsert by report_id, so
//      retries are harmless), deletes the entry and marks the report SYNCED.
//   3. If MongoDB is unavailable the entry stays, the report is marked
//      FAILED, and reconcile() retries it later (on a timer, on server
//      start and from the admin dashboard). MySQL is never rolled back
//      because of a MongoDB failure - the authoritative record exists.
//   4. reconcile() also removes orphan MongoDB documents whose report no
//      longer exists in MySQL.
import { withConnection } from '../db/mysql.js';
import * as outbox from '../repositories/outbox.js';
import * as reports from '../repositories/reports.js';
import * as itemDetails from '../repositories/mongo/itemDetails.js';
import * as activity from '../repositories/mongo/activity.js';
import { buildSearchTags, tokenize } from '../utils/text.js';

// JSON-serialisable description of the MongoDB document for a report.
export function buildPayload({ reportId, report, item, location, description, characteristics, createdAt }) {
  const tags = buildSearchTags({ itemName: item.item_name, categoryName: item.category_name, characteristics });
  return {
    report_id: reportId,
    report_type: report.report_type,
    item_name: item.item_name,
    category_id: item.category_id,
    category_name: item.category_name,
    building_name: location.building_name,
    report_date: report.report_date,
    description,
    characteristics,
    search_tags: tags.slice(0, 40),
    tokens: tokenize(item.item_name, description, ...tags),
    embedding: null,
    schema_version: 1,
    created_at: createdAt ?? new Date().toISOString(),
  };
}

function toDocument(payload) {
  return {
    ...payload,
    report_date: new Date(`${payload.report_date}T00:00:00Z`),
    created_at: new Date(payload.created_at),
  };
}

async function apply(entry) {
  if (entry.operation === 'UPSERT') await itemDetails.upsert(toDocument(entry.payload));
  else await itemDetails.remove(entry.report_id);
}

// Applies every outbox entry for one report, in order. Returns true when
// MongoDB is fully up to date for that report.
export async function pushReport(reportId) {
  const entries = await outbox.forReport(reportId);
  for (const entry of entries) {
    try {
      await apply(entry);
      await outbox.remove(entry.outbox_id);
    } catch (err) {
      await outbox.markFailed(entry.outbox_id, err.message);
      if (entry.operation === 'UPSERT') {
        await withConnection((conn) => reports.setSyncStatus(conn, reportId, 'FAILED')).catch(() => {});
      }
      console.warn(`[sync] report ${reportId} not synced yet: ${err.message}`);
      return false;
    }
  }
  if (entries.some((e) => e.operation === 'UPSERT')) {
    await withConnection((conn) => reports.setSyncStatus(conn, reportId, 'SYNCED'));
  }
  return true;
}

let running = null;

export async function reconcile() {
  // Never run two reconciliations at once in the same process.
  running ??= (async () => {
    const summary = { retried: 0, synced: 0, stillFailing: 0, orphansRemoved: 0, missingDetails: [] };
    const pending = await outbox.pending(500);
    const reportIds = [...new Set(pending.map((e) => e.report_id))];
    for (const reportId of reportIds) {
      summary.retried += 1;
      if (await pushReport(reportId)) {
        summary.synced += 1;
        activity.logQuietly(reportId, 'RESYNCED');
      } else {
        summary.stillFailing += 1;
      }
    }

    try {
      const [mysqlIds, mongoIds] = await Promise.all([reports.allIds(), itemDetails.allReportIds()]);
      const inMysql = new Set(mysqlIds);
      const inMongo = new Set(mongoIds);
      for (const id of mongoIds) {
        if (!inMysql.has(id) && !(await outbox.remainingFor(id))) {
          await itemDetails.remove(id);
          summary.orphansRemoved += 1;
        }
      }
      summary.missingDetails = mysqlIds.filter((id) => !inMongo.has(id));
    } catch (err) {
      summary.error = `MongoDB unavailable: ${err.message}`;
    }
    return summary;
  })().finally(() => { running = null; });
  return running;
}

export async function status() {
  const [queue, unsynced] = await Promise.all([outbox.stats(), reports.unsynced()]);
  return { queue, unsynced };
}

// Started once per server process from src/instrumentation.js.
export function startBackgroundReconciler(intervalMs = 5 * 60 * 1000) {
  if (globalThis.__finditReconciler) return;
  const tick = () => reconcile()
    .then((s) => { if (s.retried || s.orphansRemoved) console.log('[sync] reconcile:', JSON.stringify(s)); })
    .catch((err) => console.warn('[sync] reconcile failed:', err.message));
  setTimeout(tick, 5_000);
  globalThis.__finditReconciler = setInterval(tick, intervalMs);
  globalThis.__finditReconciler.unref?.();
}
