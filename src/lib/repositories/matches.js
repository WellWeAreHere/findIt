import { placeholders, query, queryOne, sqlInt } from '../db/mysql.js';

// Insert or refresh a suggestion. Reviewed matches keep their status; only
// the scores and explanation are refreshed. Returns 1 for a new row.
export async function upsert(conn, m) {
  const [result] = await conn.execute(
    `INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score,
                          category_score, location_score, date_score, matched_attributes, algorithm_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       description_score = VALUES(description_score),
       characteristics_score = VALUES(characteristics_score),
       category_score = VALUES(category_score),
       location_score = VALUES(location_score),
       date_score = VALUES(date_score),
       matched_attributes = VALUES(matched_attributes),
       algorithm_version = VALUES(algorithm_version)`,
    [m.lost_report_id, m.found_report_id, m.description, m.characteristics, m.category,
      m.location, m.date, JSON.stringify(m.matched), m.algorithm_version],
  );
  return result.affectedRows; // 1 = inserted, 2 = updated, 0 = unchanged
}

// A suggestion that no longer clears the threshold is withdrawn.
export async function removeSuggestion(conn, lostId, foundId) {
  await conn.execute(
    "DELETE FROM matches WHERE lost_report_id = ? AND found_report_id = ? AND match_status = 'SUGGESTED'",
    [lostId, foundId],
  );
}

const COUNTERPART_SELECT = `
  m.match_id, m.match_score, m.description_score, m.characteristics_score, m.category_score,
  m.location_score, m.date_score, m.matched_attributes, m.match_status, m.algorithm_version, m.created_at,
  m.lost_report_id, m.found_report_id`;

// Matches for one report, each with the card of the other side.
export const forReport = (reportId) => query(
  `SELECT ${COUNTERPART_SELECT},
          o.report_id AS other_report_id, o.report_type AS other_type, o.item_name AS other_item_name,
          o.description AS other_summary, o.building_name AS other_building, o.area AS other_area,
          o.report_date AS other_date, o.status AS other_status, o.user_id AS other_user_id
   FROM matches m
   JOIN v_report_card o ON o.report_id = IF(m.lost_report_id = ?, m.found_report_id, m.lost_report_id)
   WHERE (m.lost_report_id = ? OR m.found_report_id = ?) AND m.match_status <> 'DISMISSED'
   ORDER BY m.match_score DESC`,
  [reportId, reportId, reportId],
);

export const countForReport = async (reportId) => (await queryOne(
  "SELECT COUNT(*) AS n FROM matches WHERE (lost_report_id = ? OR found_report_id = ?) AND match_status <> 'DISMISSED'",
  [reportId, reportId],
)).n;

// Suggested matches touching any OPEN report owned by the user.
export const forUser = (userId) => query(
  `SELECT ${COUNTERPART_SELECT},
          mine.report_id AS my_report_id, mine.item_name AS my_item_name, mine.report_type AS my_type,
          o.report_id AS other_report_id, o.item_name AS other_item_name, o.description AS other_summary,
          o.building_name AS other_building, o.report_date AS other_date
   FROM matches m
   JOIN reports me ON me.report_id IN (m.lost_report_id, m.found_report_id) AND me.user_id = ?
   JOIN v_report_card mine ON mine.report_id = me.report_id
   JOIN v_report_card o ON o.report_id = IF(me.report_id = m.lost_report_id, m.found_report_id, m.lost_report_id)
   WHERE m.match_status <> 'DISMISSED' AND mine.status = 'OPEN'
   ORDER BY m.match_score DESC`,
  [userId],
);

export function adminList({ status, minScore = 0, limit = 50 }) {
  const params = [minScore];
  let where = 'm.match_score >= ?';
  if (status) { where += ' AND m.match_status = ?'; params.push(status); }
  return query(
    `SELECT ${COUNTERPART_SELECT},
            l.item_name AS lost_item, l.description AS lost_summary, l.reporter_name AS lost_reporter,
            l.building_name AS lost_building, l.report_date AS lost_date, l.status AS lost_status,
            f.item_name AS found_item, f.description AS found_summary, f.reporter_name AS found_reporter,
            f.building_name AS found_building, f.report_date AS found_date, f.status AS found_status
     FROM matches m
     JOIN v_report_card l ON l.report_id = m.lost_report_id
     JOIN v_report_card f ON f.report_id = m.found_report_id
     WHERE ${where}
     ORDER BY m.match_score DESC LIMIT ${sqlInt(limit, 200)}`,
    params,
  );
}

export const findById = (matchId) => queryOne('SELECT * FROM matches WHERE match_id = ?', [matchId]);

export async function setStatus(conn, matchId, status, reviewerId) {
  const [result] = await conn.execute(
    'UPDATE matches SET match_status = ?, reviewed_by = ? WHERE match_id = ?',
    [status, reviewerId, matchId],
  );
  return result.affectedRows;
}

export const existingPairs = async (reportId) => (await query(
  'SELECT lost_report_id, found_report_id, match_status FROM matches WHERE lost_report_id = ? OR found_report_id = ?',
  [reportId, reportId],
));

export async function confirmApprovedPairs(conn) {
  await conn.execute(
    `UPDATE matches m JOIN claims c
       ON c.lost_report_id = m.lost_report_id AND c.report_id = m.found_report_id AND c.status = 'APPROVED'
     SET m.match_status = 'CONFIRMED', m.reviewed_by = c.reviewed_by
     WHERE m.match_status = 'SUGGESTED'`,
  );
}

export const idsWithScores = (ids) => ids.length ? query(
  `SELECT match_id, match_score FROM matches WHERE match_id IN (${placeholders(ids)})`, ids,
) : [];
