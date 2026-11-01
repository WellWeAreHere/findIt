import { getPool, placeholders, query, queryOne, resultSets, sqlInt } from '../db/mysql.js';

const SORTS = {
  newest: 'rc.report_date DESC, rc.report_id DESC',
  oldest: 'rc.report_date ASC, rc.report_id ASC',
};

export async function insert(conn, r) {
  const [result] = await conn.execute(
    `INSERT INTO reports (user_id, item_id, location_id, custody_location_id, report_type, description, report_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [r.user_id, r.item_id, r.location_id, r.custody_location_id ?? null, r.report_type, r.summary, r.report_date],
  );
  return result.insertId;
}

const UPDATABLE = { item_id: 'item_id', location_id: 'location_id', custody_location_id: 'custody_location_id', report_date: 'report_date', summary: 'description' };

export async function update(conn, reportId, fields) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return 0;
  const [result] = await conn.execute(`UPDATE reports SET ${sets.join(', ')} WHERE report_id = ?`, [...params, reportId]);
  return result.affectedRows;
}

export async function setStatus(conn, reportId, status) {
  const [result] = await conn.execute('UPDATE reports SET status = ? WHERE report_id = ?', [status, reportId]);
  return result.affectedRows;
}

export async function remove(conn, reportId) {
  const [result] = await conn.execute('DELETE FROM reports WHERE report_id = ?', [reportId]);
  return result.affectedRows;
}

export const findCard = (reportId) => queryOne('SELECT * FROM v_report_card WHERE report_id = ?', [reportId]);

export const lockForUpdate = async (conn, reportId) =>
  (await conn.execute('SELECT report_id, user_id, status, report_type FROM reports WHERE report_id = ? FOR UPDATE', [reportId]))[0][0] ?? null;

export const countClaims = async (reportId) =>
  (await queryOne('SELECT COUNT(*) AS n FROM claims WHERE report_id = ? OR lost_report_id = ?', [reportId, reportId])).n;

function buildFilters(f) {
  const where = [];
  const params = [];
  if (f.type) { where.push('rc.report_type = ?'); params.push(f.type); }
  if (f.status) { where.push('rc.status = ?'); params.push(f.status); }
  if (f.category) { where.push('rc.category_id = ?'); params.push(f.category); }
  if (f.building) { where.push('rc.building_id = ?'); params.push(f.building); }
  if (f.location) { where.push('rc.location_id = ?'); params.push(f.location); }
  if (f.from) { where.push('rc.report_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('rc.report_date <= ?'); params.push(f.to); }
  if (f.ids) { where.push(`rc.report_id IN (${placeholders(f.ids)})`); params.push(...f.ids); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Paginated browse over the report-card view. When ids are given (from a
// MongoDB text search) the caller re-orders by relevance.
export async function browse(filters) {
  const { sql, params } = buildFilters(filters);
  const order = SORTS[filters.sort] ?? SORTS.newest;
  const limit = sqlInt(filters.pageSize, 50);
  const offset = sqlInt((filters.page - 1) * filters.pageSize, 100000);
  const [rows, [{ total }]] = await Promise.all([
    query(`SELECT rc.* FROM v_report_card rc ${sql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) AS total FROM v_report_card rc ${sql}`, params),
  ]);
  return { rows, total };
}

// All matching ids (no paging) - used to intersect with text-search hits.
export async function filterIds(filters) {
  const { sql, params } = buildFilters(filters);
  return (await query(`SELECT rc.report_id FROM v_report_card rc ${sql}`, params)).map((r) => r.report_id);
}

export const cardsByIds = (ids) =>
  ids.length ? query(`SELECT * FROM v_report_card WHERE report_id IN (${placeholders(ids)})`, ids) : [];

export const recent = (limit = 8) =>
  query(`SELECT * FROM v_report_card WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT ${sqlInt(limit, 50)}`);

// Uses the stored procedure, as the dashboard does.
export async function forUser(userId, type = null) {
  const [result] = await getPool().query('CALL sp_reports_by_user(?, ?)', [userId, type]);
  return resultSets(result)[0];
}

export const openLostForUser = (userId) => query(
  `SELECT report_id, item_name, description, report_date FROM v_report_card
   WHERE user_id = ? AND report_type = 'LOST' AND status = 'OPEN' ORDER BY report_date DESC`,
  [userId],
);

// Candidate reports for the matching engine. The SQL functions compute the
// category, location and date components in the database.
export function matchCandidates({ report, extraIds, includeResolved }) {
  const opposite = report.report_type === 'LOST' ? 'FOUND' : 'LOST';
  const dateExpr = report.report_type === 'LOST'
    ? 'fn_date_proximity(?, r.report_date)'
    : 'fn_date_proximity(r.report_date, ?)';
  const params = [report.item_id, report.location_id, report.report_date,
    opposite, report.user_id, report.report_id, report.report_date, report.category_id];
  let textClause = '';
  if (extraIds.length) {
    textClause = ` OR r.report_id IN (${placeholders(extraIds)})`;
    params.push(...extraIds);
  }
  return query(
    `SELECT r.report_id, r.user_id, r.item_id, i.item_name, r.location_id, r.report_date, r.status,
            fn_category_similarity(?, r.item_id)   AS category_score,
            fn_location_proximity(?, r.location_id) AS location_score,
            ${dateExpr}                             AS date_score
     FROM reports r
     JOIN items i ON i.item_id = r.item_id
     WHERE r.report_type = ?
       AND r.user_id <> ?
       AND r.report_id <> ?
       ${includeResolved ? '' : "AND r.status = 'OPEN'"}
       AND ABS(DATEDIFF(r.report_date, ?)) <= 30
       AND (i.category_id = ?${textClause})
     LIMIT 200`,
    params,
  );
}

export async function setSyncStatus(conn, reportId, status) {
  await conn.execute(
    'UPDATE reports SET mongo_sync_status = ?, sync_attempts = sync_attempts + 1 WHERE report_id = ?',
    [status, reportId],
  );
}

export const unsynced = () => query(
  `SELECT rc.report_id, rc.item_name, rc.reporter_name, rc.mongo_sync_status, r.sync_attempts, rc.created_at
   FROM v_report_card rc JOIN reports r ON r.report_id = rc.report_id
   WHERE rc.mongo_sync_status <> 'SYNCED' ORDER BY rc.created_at`,
);

export const allIds = async () => (await query('SELECT report_id FROM reports')).map((r) => r.report_id);
