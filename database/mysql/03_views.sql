-- =====================================================================
-- FindIt - views
-- =====================================================================

DROP VIEW IF EXISTS v_pending_claims;
DROP VIEW IF EXISTS v_recovery_stats;
DROP VIEW IF EXISTS v_unresolved_reports;
DROP VIEW IF EXISTS v_active_lost_reports;
DROP VIEW IF EXISTS v_report_card;

-- ---------------------------------------------------------------------
-- One row per report with everything a list/card needs (5-way JOIN).
-- Used by browse, dashboards and the stored procedures. Never exposes
-- password hashes.
-- ---------------------------------------------------------------------
CREATE VIEW v_report_card AS
SELECT
  r.report_id, r.report_type, r.description, r.report_date, r.status,
  r.mongo_sync_status, r.created_at, r.updated_at,
  r.user_id,       u.name  AS reporter_name,
  r.item_id,       i.item_name,
  c.category_id,   c.category_name,
  r.location_id,   b.building_id, b.building_name, b.zone, l.floor, l.area,
  r.custody_location_id,
  CONCAT(cb.building_name, ' - ', cl.area) AS custody_location
FROM reports r
JOIN users u       ON u.user_id = r.user_id
JOIN items i       ON i.item_id = r.item_id
JOIN categories c  ON c.category_id = i.category_id
JOIN locations l   ON l.location_id = r.location_id
JOIN buildings b   ON b.building_id = l.building_id
LEFT JOIN locations cl ON cl.location_id = r.custody_location_id
LEFT JOIN buildings cb ON cb.building_id = cl.building_id;

-- ---------------------------------------------------------------------
-- Lost items that are still being searched for.
-- ---------------------------------------------------------------------
CREATE VIEW v_active_lost_reports AS
SELECT rc.*, DATEDIFF(CURDATE(), rc.report_date) AS days_since_lost
FROM v_report_card rc
WHERE rc.report_type = 'LOST' AND rc.status = 'OPEN';

-- ---------------------------------------------------------------------
-- Every open report with its age, pending claims and best match
-- (correlated subqueries). Drives the admin "unresolved" queue.
-- ---------------------------------------------------------------------
CREATE VIEW v_unresolved_reports AS
SELECT
  rc.report_id, rc.report_type, rc.item_name, rc.category_name,
  rc.building_name, rc.area, rc.report_date, rc.reporter_name, rc.user_id,
  DATEDIFF(CURDATE(), rc.created_at) AS days_open,
  (SELECT COUNT(*) FROM claims c
    WHERE c.report_id = rc.report_id AND c.status = 'PENDING') AS pending_claims,
  (SELECT COUNT(*) FROM matches m
    WHERE (m.lost_report_id = rc.report_id OR m.found_report_id = rc.report_id)
      AND m.match_status <> 'DISMISSED') AS match_count,
  (SELECT MAX(m.match_score) FROM matches m
    WHERE (m.lost_report_id = rc.report_id OR m.found_report_id = rc.report_id)
      AND m.match_status <> 'DISMISSED') AS best_match_score
FROM v_report_card rc
WHERE rc.status = 'OPEN';

-- ---------------------------------------------------------------------
-- Recovery statistics per category (GROUP BY + aggregates).
-- A recovery = an approved claim on a found report.
-- ---------------------------------------------------------------------
CREATE VIEW v_recovery_stats AS
SELECT
  c.category_id,
  c.category_name,
  COUNT(r.report_id)                                        AS total_reports,
  COALESCE(SUM(r.report_type = 'LOST'), 0)                  AS lost_reports,
  COALESCE(SUM(r.report_type = 'FOUND'), 0)                 AS found_reports,
  COALESCE(SUM(r.report_type = 'FOUND' AND r.status = 'RESOLVED'), 0) AS recoveries,
  COALESCE(SUM(r.status = 'OPEN'), 0)                       AS open_reports,
  ROUND(100 * SUM(r.report_type = 'LOST' AND r.status = 'RESOLVED')
            / NULLIF(SUM(r.report_type = 'LOST'), 0), 1)    AS lost_recovery_rate_pct
FROM categories c
LEFT JOIN items i   ON i.category_id = c.category_id
LEFT JOIN reports r ON r.item_id = i.item_id
GROUP BY c.category_id, c.category_name;

-- ---------------------------------------------------------------------
-- Admin claim review queue.
-- ---------------------------------------------------------------------
CREATE VIEW v_pending_claims AS
SELECT
  cl.claim_id, cl.created_at, cl.claim_description, cl.lost_report_id,
  cl.claimant_id, cu.name AS claimant_name, cu.email AS claimant_email,
  rc.report_id, rc.item_name, rc.category_name, rc.building_name, rc.area,
  rc.report_date, rc.reporter_name AS finder_name, rc.custody_location,
  TIMESTAMPDIFF(HOUR, cl.created_at, NOW()) AS hours_waiting,
  (SELECT COUNT(*) FROM claims c2
    WHERE c2.report_id = cl.report_id AND c2.status = 'PENDING') AS competing_claims,
  (SELECT m.match_score FROM matches m
    WHERE m.lost_report_id = cl.lost_report_id AND m.found_report_id = cl.report_id) AS match_score
FROM claims cl
JOIN users cu         ON cu.user_id = cl.claimant_id
JOIN v_report_card rc ON rc.report_id = cl.report_id
WHERE cl.status = 'PENDING';
