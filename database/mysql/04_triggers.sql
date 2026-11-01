-- =====================================================================
-- FindIt - triggers
-- BEFORE triggers: database-level validation that CHECK cannot express.
-- AFTER triggers : status audit trail (status_audit_log).
-- =====================================================================

DROP TRIGGER IF EXISTS trg_reports_bi;
DROP TRIGGER IF EXISTS trg_reports_bu;
DROP TRIGGER IF EXISTS trg_reports_ai;
DROP TRIGGER IF EXISTS trg_reports_au;
DROP TRIGGER IF EXISTS trg_claims_bi;
DROP TRIGGER IF EXISTS trg_claims_bu;
DROP TRIGGER IF EXISTS trg_claims_ai;
DROP TRIGGER IF EXISTS trg_claims_au;
DROP TRIGGER IF EXISTS trg_matches_bi;
DROP TRIGGER IF EXISTS trg_matches_au;

DELIMITER $$

-- ---------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_reports_bi BEFORE INSERT ON reports
FOR EACH ROW
BEGIN
  -- CURDATE() is not allowed inside a CHECK constraint, so it lives here
  IF NEW.report_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Report date cannot be in the future';
  END IF;
  IF NEW.status <> 'OPEN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New reports must start as OPEN';
  END IF;
END$$

CREATE TRIGGER trg_reports_bu BEFORE UPDATE ON reports
FOR EACH ROW
BEGIN
  IF NEW.report_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Report date cannot be in the future';
  END IF;
  IF OLD.status = 'RESOLVED' AND NEW.status <> 'RESOLVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A resolved report cannot be reopened';
  END IF;
  IF OLD.report_type <> NEW.report_type THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Report type cannot be changed after creation';
  END IF;
END$$

CREATE TRIGGER trg_reports_ai AFTER INSERT ON reports
FOR EACH ROW
BEGIN
  INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
  VALUES ('REPORT', NEW.report_id, NULL, NEW.status, @app_user_id);
END$$

CREATE TRIGGER trg_reports_au AFTER UPDATE ON reports
FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
    VALUES ('REPORT', NEW.report_id, OLD.status, NEW.status, @app_user_id);
  END IF;
END$$

-- ---------------------------------------------------------------------
-- claims
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_claims_bi BEFORE INSERT ON claims
FOR EACH ROW
BEGIN
  DECLARE v_type    VARCHAR(5);
  DECLARE v_status  VARCHAR(10);
  DECLARE v_owner   INT UNSIGNED;
  DECLARE v_lost_type   VARCHAR(5);
  DECLARE v_lost_owner  INT UNSIGNED;
  DECLARE v_role    VARCHAR(10);

  SELECT report_type, status, user_id INTO v_type, v_status, v_owner
  FROM reports WHERE report_id = NEW.report_id;

  IF v_type <> 'FOUND' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Claims can only be made on FOUND reports';
  END IF;
  IF v_status <> 'OPEN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This item is no longer open for claims';
  END IF;
  IF v_owner = NEW.claimant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot claim an item you reported as found';
  END IF;

  SELECT role INTO v_role FROM users WHERE user_id = NEW.claimant_id AND is_active = TRUE;
  IF v_role IS NULL OR v_role <> 'STUDENT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only active students can submit claims';
  END IF;

  IF NEW.lost_report_id IS NOT NULL THEN
    SELECT report_type, user_id INTO v_lost_type, v_lost_owner
    FROM reports WHERE report_id = NEW.lost_report_id;
    IF v_lost_type <> 'LOST' OR v_lost_owner <> NEW.claimant_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Linked report must be one of your own LOST reports';
    END IF;
  END IF;

  IF NEW.status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New claims must start as PENDING';
  END IF;
END$$

CREATE TRIGGER trg_claims_bu BEFORE UPDATE ON claims
FOR EACH ROW
BEGIN
  IF OLD.status <> 'PENDING' AND NOT (OLD.status <=> NEW.status) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A decided or withdrawn claim cannot change status';
  END IF;
END$$

CREATE TRIGGER trg_claims_ai AFTER INSERT ON claims
FOR EACH ROW
BEGIN
  INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
  VALUES ('CLAIM', NEW.claim_id, NULL, NEW.status, @app_user_id);
END$$

CREATE TRIGGER trg_claims_au AFTER UPDATE ON claims
FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
    VALUES ('CLAIM', NEW.claim_id, OLD.status, NEW.status, @app_user_id);
  END IF;
END$$

-- ---------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_matches_bi BEFORE INSERT ON matches
FOR EACH ROW
BEGIN
  DECLARE v_lost_type  VARCHAR(5);
  DECLARE v_found_type VARCHAR(5);
  DECLARE v_lost_user  INT UNSIGNED;
  DECLARE v_found_user INT UNSIGNED;

  IF NEW.lost_report_id = NEW.found_report_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A report cannot be matched with itself';
  END IF;

  SELECT report_type, user_id INTO v_lost_type, v_lost_user
  FROM reports WHERE report_id = NEW.lost_report_id;
  SELECT report_type, user_id INTO v_found_type, v_found_user
  FROM reports WHERE report_id = NEW.found_report_id;

  IF v_lost_type <> 'LOST' OR v_found_type <> 'FOUND' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A match must pair a LOST report with a FOUND report';
  END IF;
  IF v_lost_user = v_found_user THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reports by the same user cannot be matched';
  END IF;
END$$

CREATE TRIGGER trg_matches_au AFTER UPDATE ON matches
FOR EACH ROW
BEGIN
  IF NOT (OLD.match_status <=> NEW.match_status) THEN
    INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
    VALUES ('MATCH', NEW.match_id, OLD.match_status, NEW.match_status, @app_user_id);
  END IF;
END$$

DELIMITER ;
