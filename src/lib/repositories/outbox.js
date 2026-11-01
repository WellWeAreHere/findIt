import { query, sqlInt } from '../db/mysql.js';

export async function enqueue(conn, reportId, operation, payload = null) {
  const [result] = await conn.execute(
    'INSERT INTO mongo_outbox (report_id, operation, payload) VALUES (?, ?, ?)',
    [reportId, operation, payload ? JSON.stringify(payload) : null],
  );
  return result.insertId;
}

export const pending = (limit = 50) => query(
  `SELECT outbox_id, report_id, operation, payload, attempts FROM mongo_outbox
   ORDER BY outbox_id LIMIT ${sqlInt(limit, 500)}`,
);

export const forReport = (reportId) => query(
  'SELECT outbox_id, report_id, operation, payload, attempts FROM mongo_outbox WHERE report_id = ? ORDER BY outbox_id',
  [reportId],
);

export const remove = (outboxId) => query('DELETE FROM mongo_outbox WHERE outbox_id = ?', [outboxId]);

export const markFailed = (outboxId, error) => query(
  'UPDATE mongo_outbox SET attempts = LEAST(attempts + 1, 255), last_error = ? WHERE outbox_id = ?',
  [String(error).slice(0, 255), outboxId],
);

export const remainingFor = async (reportId) =>
  (await query('SELECT COUNT(*) AS n FROM mongo_outbox WHERE report_id = ?', [reportId]))[0].n;

export const stats = () => query(
  'SELECT operation, COUNT(*) AS entries, MAX(attempts) AS max_attempts, MIN(created_at) AS oldest FROM mongo_outbox GROUP BY operation',
);
