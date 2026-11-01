-- =====================================================================
-- FindIt - migration v3: transactional outbox for MongoDB writes
--
-- A report's MySQL row and the MongoDB write it requires are recorded in
-- the SAME MySQL transaction (reports + mongo_outbox). The backend then
-- applies the outbox entry to MongoDB and deletes it. If MongoDB is down,
-- the entry survives and the reconciler retries it later, so no report
-- details are ever lost. Entries are transient: they exist only until
-- MongoDB has the data, so this is not a second copy of item details.
-- =====================================================================

CREATE TABLE mongo_outbox (
  outbox_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id   INT UNSIGNED NOT NULL,          -- no FK: DELETE entries outlive the report
  operation   ENUM('UPSERT','DELETE') NOT NULL,
  payload     JSON NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_mongo_outbox PRIMARY KEY (outbox_id),
  CONSTRAINT chk_outbox_payload CHECK (operation = 'DELETE' OR payload IS NOT NULL),
  INDEX idx_outbox_report (report_id),
  INDEX idx_outbox_attempts (attempts, outbox_id)
) ENGINE = InnoDB;
