-- =====================================================================
-- FindIt - MySQL schema (DDL)
-- Run order: 01_schema -> 02_functions_procedures -> 03_views
--            -> 04_triggers -> 05_seed
-- Demonstrates: CREATE, DROP, PK/FK, NOT NULL, UNIQUE, CHECK, DEFAULT,
--               ENUM domains, generated columns, composite indexes.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS status_audit_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS buildings;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- users: students and administrators
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  srn            VARCHAR(20)  NULL,
  password_hash  CHAR(60)     NOT NULL,
  role           ENUM('STUDENT','ADMIN') NOT NULL DEFAULT 'STUDENT',
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_users PRIMARY KEY (user_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_srn UNIQUE (srn),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(TRIM(name)) >= 2),
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_users_student_srn CHECK (role = 'ADMIN' OR srn IS NOT NULL),
  CONSTRAINT chk_users_hash CHECK (password_hash LIKE '$2%')
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- categories / items: item-type catalogue (Item N:1 Category)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  category_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name  VARCHAR(60)  NOT NULL,
  description    VARCHAR(255) NULL,
  CONSTRAINT pk_categories PRIMARY KEY (category_id),
  CONSTRAINT uq_categories_name UNIQUE (category_name)
) ENGINE = InnoDB;

CREATE TABLE items (
  item_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id    INT UNSIGNED NOT NULL,
  item_name      VARCHAR(80)  NOT NULL,
  CONSTRAINT pk_items PRIMARY KEY (item_id),
  CONSTRAINT uq_items_category_name UNIQUE (category_id, item_name),
  CONSTRAINT fk_items_category FOREIGN KEY (category_id)
    REFERENCES categories (category_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- buildings / locations (Location N:1 Building). Zone lives on the
-- building to avoid the transitive dependency location -> building -> zone.
-- ---------------------------------------------------------------------
CREATE TABLE buildings (
  building_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_name  VARCHAR(80)  NOT NULL,
  zone           ENUM('ACADEMIC','HOSTEL','FOOD','SPORTS','ADMIN','OPEN_AREA') NOT NULL,
  CONSTRAINT pk_buildings PRIMARY KEY (building_id),
  CONSTRAINT uq_buildings_name UNIQUE (building_name)
) ENGINE = InnoDB;

CREATE TABLE locations (
  location_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id    INT UNSIGNED NOT NULL,
  floor          TINYINT      NOT NULL DEFAULT 0,
  area           VARCHAR(100) NOT NULL,
  CONSTRAINT pk_locations PRIMARY KEY (location_id),
  CONSTRAINT uq_locations_place UNIQUE (building_id, floor, area),
  CONSTRAINT chk_locations_floor CHECK (floor BETWEEN -2 AND 15),
  CONSTRAINT fk_locations_building FOREIGN KEY (building_id)
    REFERENCES buildings (building_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- reports: LOST / FOUND reports. report_id is also the MongoDB link key.
-- mongo_sync_status + sync_attempts form the outbox used by the
-- MySQL -> MongoDB reconciler.
-- ---------------------------------------------------------------------
CREATE TABLE reports (
  report_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id              INT UNSIGNED NOT NULL,
  item_id              INT UNSIGNED NOT NULL,
  location_id          INT UNSIGNED NOT NULL,
  custody_location_id  INT UNSIGNED NULL,
  report_type          ENUM('LOST','FOUND') NOT NULL,
  description          VARCHAR(255) NOT NULL,
  report_date          DATE         NOT NULL,
  status               ENUM('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  mongo_sync_status    ENUM('PENDING','SYNCED','FAILED') NOT NULL DEFAULT 'PENDING',
  sync_attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pk_reports PRIMARY KEY (report_id),
  CONSTRAINT chk_reports_description CHECK (CHAR_LENGTH(TRIM(description)) >= 10),
  CONSTRAINT chk_reports_date_floor CHECK (report_date >= '2020-01-01'),
  CONSTRAINT chk_reports_custody CHECK (report_type = 'FOUND' OR custody_location_id IS NULL),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_item FOREIGN KEY (item_id)
    REFERENCES items (item_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_location FOREIGN KEY (location_id)
    REFERENCES locations (location_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_custody FOREIGN KEY (custody_location_id)
    REFERENCES locations (location_id) ON DELETE RESTRICT,
  INDEX idx_reports_browse (report_type, status, report_date),
  INDEX idx_reports_owner (user_id, report_type),
  INDEX idx_reports_status_created (status, created_at),
  INDEX idx_reports_sync (mongo_sync_status)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- claims: ownership claims on FOUND reports (User M:N Report).
-- approved_report_id is a generated column that is non-NULL only for an
-- APPROVED claim; its UNIQUE index guarantees at most one approved claim
-- per report (MySQL has no partial unique indexes).
-- ---------------------------------------------------------------------
CREATE TABLE claims (
  claim_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id           INT UNSIGNED NOT NULL,
  claimant_id         INT UNSIGNED NOT NULL,
  lost_report_id      INT UNSIGNED NULL,
  claim_description   TEXT         NOT NULL,
  status              ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  reviewed_by         INT UNSIGNED NULL,
  review_note         VARCHAR(255) NULL,
  reviewed_at         DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_report_id  INT UNSIGNED
    GENERATED ALWAYS AS (IF(status = 'APPROVED', report_id, NULL)) STORED,
  CONSTRAINT pk_claims PRIMARY KEY (claim_id),
  CONSTRAINT uq_claims_one_per_user UNIQUE (report_id, claimant_id),
  CONSTRAINT uq_claims_one_approved UNIQUE (approved_report_id),
  CONSTRAINT chk_claims_description CHECK (CHAR_LENGTH(TRIM(claim_description)) >= 20),
  CONSTRAINT chk_claims_review CHECK (
    (status IN ('PENDING','WITHDRAWN') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT fk_claims_report FOREIGN KEY (report_id)
    REFERENCES reports (report_id) ON DELETE RESTRICT,
  CONSTRAINT fk_claims_claimant FOREIGN KEY (claimant_id)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_claims_lost_report FOREIGN KEY (lost_report_id)
    REFERENCES reports (report_id) ON DELETE SET NULL,
  CONSTRAINT fk_claims_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  INDEX idx_claims_status_created (status, created_at),
  INDEX idx_claims_claimant (claimant_id, status)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- matches: suggested LOST <-> FOUND pairs (recursive M:N on reports).
-- Component scores are stored; the total is a generated column, so it can
-- never disagree with its components. LOST/FOUND typing and lost <> found
-- are enforced by trg_matches_bi (MySQL forbids CHECK constraints on
-- columns used by a cascading foreign key).
-- ---------------------------------------------------------------------
CREATE TABLE matches (
  match_id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lost_report_id         INT UNSIGNED NOT NULL,
  found_report_id        INT UNSIGNED NOT NULL,
  description_score      DECIMAL(4,3) NOT NULL,
  characteristics_score  DECIMAL(4,3) NOT NULL,
  category_score         DECIMAL(4,3) NOT NULL,
  location_score         DECIMAL(4,3) NOT NULL,
  date_score             DECIMAL(4,3) NOT NULL,
  match_score            DECIMAL(5,2) GENERATED ALWAYS AS (ROUND(100 * (
                           0.35 * description_score + 0.25 * characteristics_score +
                           0.15 * category_score    + 0.15 * location_score +
                           0.10 * date_score), 2)) STORED,
  matched_attributes     JSON         NOT NULL DEFAULT (JSON_ARRAY()),
  match_status           ENUM('SUGGESTED','CONFIRMED','DISMISSED') NOT NULL DEFAULT 'SUGGESTED',
  algorithm_version      VARCHAR(20)  NOT NULL DEFAULT 'weighted-v1',
  reviewed_by            INT UNSIGNED NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pk_matches PRIMARY KEY (match_id),
  CONSTRAINT uq_matches_pair UNIQUE (lost_report_id, found_report_id),
  CONSTRAINT chk_matches_desc  CHECK (description_score     BETWEEN 0 AND 1),
  CONSTRAINT chk_matches_char  CHECK (characteristics_score BETWEEN 0 AND 1),
  CONSTRAINT chk_matches_cat   CHECK (category_score        BETWEEN 0 AND 1),
  CONSTRAINT chk_matches_loc   CHECK (location_score        BETWEEN 0 AND 1),
  CONSTRAINT chk_matches_date  CHECK (date_score            BETWEEN 0 AND 1),
  CONSTRAINT fk_matches_lost FOREIGN KEY (lost_report_id)
    REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_found FOREIGN KEY (found_report_id)
    REFERENCES reports (report_id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (user_id) ON DELETE SET NULL,
  INDEX idx_matches_found (found_report_id),
  INDEX idx_matches_score (match_status, match_score)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            INT UNSIGNED NOT NULL,
  related_report_id  INT UNSIGNED NULL,
  message            VARCHAR(255) NOT NULL,
  notification_type  ENUM('MATCH_FOUND','CLAIM_RECEIVED','CLAIM_APPROVED',
                          'CLAIM_REJECTED','REPORT_RESOLVED','SYSTEM') NOT NULL,
  is_read            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_notifications PRIMARY KEY (notification_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_report FOREIGN KEY (related_report_id)
    REFERENCES reports (report_id) ON DELETE SET NULL,
  INDEX idx_notifications_inbox (user_id, is_read, created_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- status_audit_log: written only by triggers. No FK on entity_id on
-- purpose - history must survive deletion of the audited row.
-- changed_by comes from the session variable @app_user_id, which the
-- backend sets on its connection before each write.
-- ---------------------------------------------------------------------
CREATE TABLE status_audit_log (
  audit_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type  ENUM('REPORT','CLAIM','MATCH') NOT NULL,
  entity_id    INT UNSIGNED NOT NULL,
  old_status   VARCHAR(20)  NULL,
  new_status   VARCHAR(20)  NOT NULL,
  changed_by   INT UNSIGNED NULL,
  changed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_status_audit_log PRIMARY KEY (audit_id),
  INDEX idx_audit_entity (entity_type, entity_id, changed_at),
  INDEX idx_audit_recent (changed_at)
) ENGINE = InnoDB;
