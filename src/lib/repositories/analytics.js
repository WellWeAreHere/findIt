// SQL analytics for the admin dashboard (aggregates, GROUP BY / HAVING,
// views and the recovery-summary procedure).
import { getPool, query, queryOne, resultSets, sqlInt } from '../db/mysql.js';

export const totals = () => queryOne(
  `SELECT COUNT(*) AS total_reports,
          SUM(report_type = 'LOST')  AS lost_reports,
          SUM(report_type = 'FOUND') AS found_reports,
          SUM(status = 'OPEN')       AS unresolved_reports,
          SUM(status = 'RESOLVED' AND report_type = 'FOUND') AS recoveries,
          SUM(status = 'CLOSED')     AS closed_reports,
          (SELECT COUNT(*) FROM claims WHERE status = 'PENDING') AS pending_claims,
          (SELECT COUNT(*) FROM matches WHERE match_status = 'SUGGESTED') AS suggested_matches,
          (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active) AS active_students
   FROM reports`,
);

export const recoveryByCategory = () => query('SELECT * FROM v_recovery_stats ORDER BY total_reports DESC, category_name');

// Buildings with at least `min` reports (GROUP BY ... HAVING).
export const hotspots = (min = 2) => query(
  `SELECT b.building_id, b.building_name, b.zone,
          COUNT(*) AS total_reports,
          SUM(r.report_type = 'LOST') AS lost, SUM(r.report_type = 'FOUND') AS found,
          SUM(r.status = 'OPEN') AS still_open
   FROM reports r
   JOIN locations l ON l.location_id = r.location_id
   JOIN buildings b ON b.building_id = l.building_id
   GROUP BY b.building_id, b.building_name, b.zone
   HAVING COUNT(*) >= ?
   ORDER BY total_reports DESC, b.building_name
   LIMIT 10`,
  [min],
);

export const oldestUnresolved = (limit = 10) => query(
  `SELECT * FROM v_unresolved_reports ORDER BY days_open DESC, report_id LIMIT ${sqlInt(limit, 50)}`,
);

// Lost reports that no found report has been matched to (NOT EXISTS subquery).
export const unmatchedLost = (limit = 10) => query(
  `SELECT rc.report_id, rc.item_name, rc.building_name, rc.report_date, rc.reporter_name
   FROM v_report_card rc
   WHERE rc.report_type = 'LOST' AND rc.status = 'OPEN'
     AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.lost_report_id = rc.report_id AND m.match_status <> 'DISMISSED')
   ORDER BY rc.report_date LIMIT ${sqlInt(limit, 50)}`,
);

// Recent status changes from the trigger-maintained audit log.
export const recentActivity = (limit = 15) => query(
  `SELECT a.audit_id, a.entity_type, a.entity_id, a.old_status, a.new_status, a.changed_at,
          u.name AS changed_by_name,
          CASE a.entity_type
            WHEN 'REPORT' THEN (SELECT CONCAT(i.item_name, ' (', r.report_type, ')') FROM reports r JOIN items i ON i.item_id = r.item_id WHERE r.report_id = a.entity_id)
            WHEN 'CLAIM'  THEN (SELECT CONCAT('Claim on ', i.item_name) FROM claims c JOIN reports r ON r.report_id = c.report_id JOIN items i ON i.item_id = r.item_id WHERE c.claim_id = a.entity_id)
            ELSE (SELECT CONCAT('Match: ', i.item_name) FROM matches m JOIN reports r ON r.report_id = m.lost_report_id JOIN items i ON i.item_id = r.item_id WHERE m.match_id = a.entity_id)
          END AS subject
   FROM status_audit_log a
   LEFT JOIN users u ON u.user_id = a.changed_by
   ORDER BY a.changed_at DESC, a.audit_id DESC LIMIT ${sqlInt(limit, 100)}`,
);

export async function recoverySummary(from, to) {
  const [result] = await getPool().query('CALL sp_recovery_summary(?, ?)', [from, to]);
  const [overall, byCategory, byBuilding] = resultSets(result);
  return { overall: overall[0], byCategory, byBuilding };
}
