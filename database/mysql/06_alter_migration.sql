-- =====================================================================
-- FindIt - migration v2 (ALTER / DROP demonstration)
-- Applied after the base schema and seed, the way a real schema change
-- reaches an already-populated database.
-- =====================================================================

-- 1. Students asked to be contacted by phone: add an optional column
--    with its own validation constraint.
ALTER TABLE users
  ADD COLUMN phone VARCHAR(15) NULL AFTER srn,
  ADD CONSTRAINT chk_users_phone CHECK (phone IS NULL OR phone REGEXP '^[+]?[0-9]{10,14}$');

-- 2. New notification type for reminders about long-unclaimed items.
ALTER TABLE notifications
  MODIFY COLUMN notification_type
    ENUM('MATCH_FOUND','CLAIM_RECEIVED','CLAIM_APPROVED','CLAIM_REJECTED',
         'REPORT_RESOLVED','SYSTEM','REMINDER') NOT NULL;

-- 3. Index tuning: the "recent items" feed sorts by report_date alone,
--    which idx_reports_browse (type, status, date) cannot serve.
CREATE INDEX idx_reports_date ON reports (report_date);

-- 4. A temporary staging table used during an import, then dropped.
CREATE TABLE import_staging_reports (
  staging_id  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  raw_line    TEXT NOT NULL,
  loaded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;
DROP TABLE import_staging_reports;

-- Rollback (manual):
--   DROP INDEX idx_reports_date ON reports;
--   ALTER TABLE users DROP CONSTRAINT chk_users_phone, DROP COLUMN phone;
