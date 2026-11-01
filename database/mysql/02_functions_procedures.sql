-- =====================================================================
-- FindIt - stored functions and procedures
-- =====================================================================

DROP FUNCTION IF EXISTS fn_location_proximity;
DROP FUNCTION IF EXISTS fn_date_proximity;
DROP FUNCTION IF EXISTS fn_category_similarity;
DROP FUNCTION IF EXISTS fn_days_open;
DROP PROCEDURE IF EXISTS sp_approve_claim;
DROP PROCEDURE IF EXISTS sp_reject_claim;
DROP PROCEDURE IF EXISTS sp_recovery_summary;
DROP PROCEDURE IF EXISTS sp_reports_by_user;
DROP PROCEDURE IF EXISTS sp_reports_by_category;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Location proximity used by the matching engine (0..1):
-- same location 1.0, same building+floor 0.8, same building 0.6,
-- same campus zone 0.3, otherwise 0.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_location_proximity(p_a INT UNSIGNED, p_b INT UNSIGNED)
RETURNS DECIMAL(4,3)
READS SQL DATA
BEGIN
  DECLARE v_building_a, v_building_b INT UNSIGNED;
  DECLARE v_floor_a, v_floor_b TINYINT;
  DECLARE v_zone_a, v_zone_b VARCHAR(20);

  IF p_a = p_b THEN
    RETURN 1.000;
  END IF;

  SELECT l.building_id, l.floor, b.zone INTO v_building_a, v_floor_a, v_zone_a
  FROM locations l JOIN buildings b ON b.building_id = l.building_id
  WHERE l.location_id = p_a;

  SELECT l.building_id, l.floor, b.zone INTO v_building_b, v_floor_b, v_zone_b
  FROM locations l JOIN buildings b ON b.building_id = l.building_id
  WHERE l.location_id = p_b;

  IF v_building_a IS NULL OR v_building_b IS NULL THEN
    RETURN 0.000;
  ELSEIF v_building_a = v_building_b AND v_floor_a = v_floor_b THEN
    RETURN 0.800;
  ELSEIF v_building_a = v_building_b THEN
    RETURN 0.600;
  ELSEIF v_zone_a = v_zone_b THEN
    RETURN 0.300;
  END IF;
  RETURN 0.000;
END$$

-- ---------------------------------------------------------------------
-- Date proximity (0..1): linear decay over 14 days. An item cannot be
-- found more than a day before it was lost, so that scores 0.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_date_proximity(p_lost DATE, p_found DATE)
RETURNS DECIMAL(4,3)
DETERMINISTIC NO SQL
BEGIN
  DECLARE v_diff INT DEFAULT DATEDIFF(p_found, p_lost);
  IF v_diff < -1 THEN
    RETURN 0.000;
  END IF;
  RETURN GREATEST(0, 1 - ABS(v_diff) / 14);
END$$

-- ---------------------------------------------------------------------
-- Category similarity (0..1): same item type 1.0, same category 0.6.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_category_similarity(p_item_a INT UNSIGNED, p_item_b INT UNSIGNED)
RETURNS DECIMAL(4,3)
READS SQL DATA
BEGIN
  DECLARE v_same_category INT DEFAULT 0;
  IF p_item_a = p_item_b THEN
    RETURN 1.000;
  END IF;
  SELECT COUNT(*) INTO v_same_category
  FROM items a JOIN items b ON a.category_id = b.category_id
  WHERE a.item_id = p_item_a AND b.item_id = p_item_b;
  RETURN IF(v_same_category > 0, 0.600, 0.000);
END$$

-- ---------------------------------------------------------------------
-- Days a report has been open (or was open until it was closed/resolved,
-- using the audit log written by the triggers).
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_days_open(p_report_id INT UNSIGNED)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_created DATETIME;
  DECLARE v_status VARCHAR(10);
  DECLARE v_closed_at DATETIME;

  SELECT created_at, status INTO v_created, v_status
  FROM reports WHERE report_id = p_report_id;

  IF v_created IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_status <> 'OPEN' THEN
    SELECT MAX(changed_at) INTO v_closed_at
    FROM status_audit_log
    WHERE entity_type = 'REPORT' AND entity_id = p_report_id AND new_status = v_status;
  END IF;

  RETURN DATEDIFF(COALESCE(v_closed_at, NOW()), v_created);
END$$

-- ---------------------------------------------------------------------
-- TRANSACTION: approve a claim atomically.
--   * only an active ADMIN may approve
--   * claim must be PENDING and the found report still OPEN
--   * row locks (SELECT ... FOR UPDATE) serialise concurrent approvals
--   * competing pending claims are rejected
--   * found report and the claimant's linked lost report become RESOLVED
--   * the corresponding match (if any) is CONFIRMED
--   * everyone involved is notified
-- Any error rolls the whole unit back and is re-raised to the caller.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_approve_claim(
  IN p_claim_id INT UNSIGNED,
  IN p_admin_id INT UNSIGNED,
  IN p_note     VARCHAR(255)
)
BEGIN
  DECLARE v_role         VARCHAR(10);
  DECLARE v_report_id    INT UNSIGNED;
  DECLARE v_claimant_id  INT UNSIGNED;
  DECLARE v_lost_id      INT UNSIGNED;
  DECLARE v_claim_status VARCHAR(10);
  DECLARE v_report_status VARCHAR(10);
  DECLARE v_finder_id    INT UNSIGNED;
  DECLARE v_item_name    VARCHAR(80);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT role INTO v_role FROM users WHERE user_id = p_admin_id AND is_active = TRUE;
  IF v_role IS NULL OR v_role <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an active administrator can approve claims';
  END IF;

  START TRANSACTION;

  -- report_id never changes, so it can be read without a lock
  SELECT report_id INTO v_report_id FROM claims WHERE claim_id = p_claim_id;
  IF v_report_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Claim not found';
  END IF;

  -- Lock order: the found report first, then its claims. Every approval
  -- for the same item queues on this one row lock, so competing approvals
  -- run one after another instead of deadlocking.
  SELECT r.status, r.user_id, i.item_name
    INTO v_report_status, v_finder_id, v_item_name
  FROM reports r JOIN items i ON i.item_id = r.item_id
  WHERE r.report_id = v_report_id
  FOR UPDATE;

  SELECT claimant_id, lost_report_id, status
    INTO v_claimant_id, v_lost_id, v_claim_status
  FROM claims WHERE claim_id = p_claim_id
  FOR UPDATE;

  IF v_claim_status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only pending claims can be approved';
  END IF;
  IF v_report_status <> 'OPEN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This item is no longer open for claims';
  END IF;

  SET @app_user_id = p_admin_id;

  -- notify competing claimants before their claims are rejected
  INSERT INTO notifications (user_id, related_report_id, message, notification_type)
  SELECT c.claimant_id, v_report_id,
         CONCAT('Your claim for the found ', v_item_name, ' was not approved: another claim was verified.'),
         'CLAIM_REJECTED'
  FROM claims c
  WHERE c.report_id = v_report_id AND c.status = 'PENDING' AND c.claim_id <> p_claim_id;

  UPDATE claims
     SET status = 'REJECTED', reviewed_by = p_admin_id, reviewed_at = NOW(),
         review_note = 'Another claim for this item was approved'
   WHERE report_id = v_report_id AND status = 'PENDING' AND claim_id <> p_claim_id;

  UPDATE claims
     SET status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = NOW(), review_note = p_note
   WHERE claim_id = p_claim_id;

  UPDATE reports SET status = 'RESOLVED' WHERE report_id = v_report_id;

  IF v_lost_id IS NOT NULL THEN
    UPDATE reports SET status = 'RESOLVED' WHERE report_id = v_lost_id AND status = 'OPEN';
    UPDATE matches SET match_status = 'CONFIRMED', reviewed_by = p_admin_id
     WHERE lost_report_id = v_lost_id AND found_report_id = v_report_id;
  END IF;

  INSERT INTO notifications (user_id, related_report_id, message, notification_type) VALUES
    (v_claimant_id, v_report_id,
     CONCAT('Your claim for the ', v_item_name, ' was approved. Collect it from the Lost & Found desk.'),
     'CLAIM_APPROVED'),
    (v_finder_id, v_report_id,
     CONCAT('The ', v_item_name, ' you found has been returned to its owner. Thank you!'),
     'REPORT_RESOLVED');

  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Reject a pending claim (admin only).
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_reject_claim(
  IN p_claim_id INT UNSIGNED,
  IN p_admin_id INT UNSIGNED,
  IN p_note     VARCHAR(255)
)
BEGIN
  DECLARE v_role         VARCHAR(10);
  DECLARE v_claim_status VARCHAR(10);
  DECLARE v_claimant_id  INT UNSIGNED;
  DECLARE v_report_id    INT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT role INTO v_role FROM users WHERE user_id = p_admin_id AND is_active = TRUE;
  IF v_role IS NULL OR v_role <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an active administrator can reject claims';
  END IF;

  START TRANSACTION;

  SELECT status, claimant_id, report_id INTO v_claim_status, v_claimant_id, v_report_id
  FROM claims WHERE claim_id = p_claim_id FOR UPDATE;

  IF v_claim_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Claim not found';
  END IF;
  IF v_claim_status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only pending claims can be rejected';
  END IF;

  SET @app_user_id = p_admin_id;

  UPDATE claims
     SET status = 'REJECTED', reviewed_by = p_admin_id, reviewed_at = NOW(),
         review_note = COALESCE(p_note, 'Ownership could not be verified')
   WHERE claim_id = p_claim_id;

  INSERT INTO notifications (user_id, related_report_id, message, notification_type)
  VALUES (v_claimant_id, v_report_id,
          CONCAT('Your claim was rejected: ', COALESCE(p_note, 'ownership could not be verified.')),
          'CLAIM_REJECTED');

  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Recovery summary for a date range. Returns three result sets:
--   1. overall totals   2. per category (GROUP BY ... HAVING)   3. per building
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_recovery_summary(IN p_from DATE, IN p_to DATE)
BEGIN
  SELECT
    COUNT(*)                                             AS total_reports,
    SUM(r.report_type = 'LOST')                          AS lost_reports,
    SUM(r.report_type = 'FOUND')                         AS found_reports,
    SUM(r.status = 'RESOLVED' AND r.report_type = 'FOUND') AS items_returned,
    SUM(r.status = 'OPEN')                               AS still_open,
    ROUND(100 * SUM(r.status = 'RESOLVED' AND r.report_type = 'LOST')
              / NULLIF(SUM(r.report_type = 'LOST'), 0), 1) AS lost_recovery_rate_pct,
    ROUND(AVG(CASE WHEN r.status = 'RESOLVED' THEN fn_days_open(r.report_id) END), 1)
                                                         AS avg_days_to_resolve
  FROM reports r
  WHERE r.report_date BETWEEN p_from AND p_to;

  SELECT c.category_name,
         COUNT(*)                                        AS total_reports,
         SUM(r.report_type = 'LOST')                     AS lost,
         SUM(r.report_type = 'FOUND')                    AS found,
         SUM(r.status = 'RESOLVED' AND r.report_type = 'FOUND') AS returned
  FROM reports r
  JOIN items i      ON i.item_id = r.item_id
  JOIN categories c ON c.category_id = i.category_id
  WHERE r.report_date BETWEEN p_from AND p_to
  GROUP BY c.category_id, c.category_name
  HAVING COUNT(*) >= 2
  ORDER BY total_reports DESC, c.category_name;

  SELECT b.building_name, b.zone,
         COUNT(*)                     AS total_reports,
         SUM(r.report_type = 'LOST')  AS lost,
         SUM(r.report_type = 'FOUND') AS found
  FROM reports r
  JOIN locations l ON l.location_id = r.location_id
  JOIN buildings b ON b.building_id = l.building_id
  WHERE r.report_date BETWEEN p_from AND p_to
  GROUP BY b.building_id, b.building_name, b.zone
  ORDER BY total_reports DESC, b.building_name;
END$$

-- ---------------------------------------------------------------------
-- Reports for a user, optionally filtered by type (NULL = both).
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_reports_by_user(IN p_user_id INT UNSIGNED, IN p_type VARCHAR(5))
BEGIN
  SELECT rc.*,
         (SELECT COUNT(*) FROM claims c
           WHERE c.report_id = rc.report_id AND c.status = 'PENDING') AS pending_claims,
         (SELECT MAX(m.match_score) FROM matches m
           WHERE (m.lost_report_id = rc.report_id OR m.found_report_id = rc.report_id)
             AND m.match_status <> 'DISMISSED')                   AS best_match_score
  FROM v_report_card rc
  WHERE rc.user_id = p_user_id
    AND (p_type IS NULL OR rc.report_type = p_type)
  ORDER BY rc.created_at DESC;
END$$

-- ---------------------------------------------------------------------
-- Reports in a category, optionally filtered by status (NULL = all).
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_reports_by_category(IN p_category_id INT UNSIGNED, IN p_status VARCHAR(10))
BEGIN
  SELECT rc.*
  FROM v_report_card rc
  WHERE rc.category_id = p_category_id
    AND (p_status IS NULL OR rc.status = p_status)
  ORDER BY rc.report_date DESC, rc.report_id DESC;
END$$

DELIMITER ;
