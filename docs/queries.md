# FindIt: Important Queries

Every query below is real code from the project. The file it comes from is given after each one. In the application, every user-supplied value is bound with `?` placeholders (prepared statements). Only validated integers are inlined, for LIMIT/OFFSET.

---

## SQL

### 1. Report card: five-table JOIN, as a view
Used by browse, item pages, dashboards and the stored procedures. `database/mysql/03_views.sql`
```sql
CREATE VIEW v_report_card AS
SELECT r.report_id, r.report_type, r.description, r.report_date, r.status, …,
       u.name AS reporter_name, i.item_name, c.category_id, c.category_name,
       b.building_id, b.building_name, b.zone, l.floor, l.area,
       CONCAT(cb.building_name, ' - ', cl.area) AS custody_location
FROM reports r
JOIN users u       ON u.user_id = r.user_id
JOIN items i       ON i.item_id = r.item_id
JOIN categories c  ON c.category_id = i.category_id
JOIN locations l   ON l.location_id = r.location_id
JOIN buildings b   ON b.building_id = l.building_id
LEFT JOIN locations cl ON cl.location_id = r.custody_location_id
LEFT JOIN buildings cb ON cb.building_id = cl.building_id;
```

### 2. Filtered, paginated browse (dynamic WHERE, parameterised)
`src/lib/repositories/reports.js`
```sql
SELECT rc.* FROM v_report_card rc
WHERE rc.report_type = ? AND rc.status = ? AND rc.category_id = ?
  AND rc.report_date >= ? AND rc.report_date <= ?
ORDER BY rc.report_date DESC, rc.report_id DESC
LIMIT 12 OFFSET 0;
-- served by INDEX idx_reports_browse (report_type, status, report_date): covering range scan
```

### 3. Unresolved reports: correlated subqueries
Admin "longest unresolved" panel. `03_views.sql`
```sql
SELECT rc.report_id, rc.item_name, DATEDIFF(CURDATE(), rc.created_at) AS days_open,
  (SELECT COUNT(*) FROM claims c WHERE c.report_id = rc.report_id AND c.status = 'PENDING') AS pending_claims,
  (SELECT MAX(m.match_score) FROM matches m
    WHERE (m.lost_report_id = rc.report_id OR m.found_report_id = rc.report_id)
      AND m.match_status <> 'DISMISSED') AS best_match_score
FROM v_report_card rc WHERE rc.status = 'OPEN';
```

### 4. Campus hotspots: GROUP BY and HAVING
`src/lib/repositories/analytics.js`
```sql
SELECT b.building_name, b.zone, COUNT(*) AS total_reports,
       SUM(r.report_type = 'LOST') AS lost, SUM(r.report_type = 'FOUND') AS found,
       SUM(r.status = 'OPEN') AS still_open
FROM reports r
JOIN locations l ON l.location_id = r.location_id
JOIN buildings b ON b.building_id = l.building_id
GROUP BY b.building_id, b.building_name, b.zone
HAVING COUNT(*) >= ?
ORDER BY total_reports DESC LIMIT 10;
```

### 5. Lost items nobody has matched: NOT EXISTS
`analytics.js`
```sql
SELECT rc.report_id, rc.item_name, rc.building_name, rc.report_date
FROM v_report_card rc
WHERE rc.report_type = 'LOST' AND rc.status = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM matches m
                  WHERE m.lost_report_id = rc.report_id AND m.match_status <> 'DISMISSED');
```

### 6. Recovery statistics per category: LEFT JOIN and aggregates
`03_views.sql`
```sql
SELECT c.category_name, COUNT(r.report_id) AS total_reports,
       COALESCE(SUM(r.report_type = 'FOUND' AND r.status = 'RESOLVED'), 0) AS recoveries,
       ROUND(100 * SUM(r.report_type = 'LOST' AND r.status = 'RESOLVED')
                 / NULLIF(SUM(r.report_type = 'LOST'), 0), 1) AS lost_recovery_rate_pct
FROM categories c
LEFT JOIN items i   ON i.category_id = c.category_id
LEFT JOIN reports r ON r.item_id = i.item_id
GROUP BY c.category_id, c.category_name;
```

### 7. Matching candidates: stored functions inside a query
SQL computes three of the five score components. `reports.js`
```sql
SELECT r.report_id, r.user_id, i.item_name, r.report_date,
       fn_category_similarity(?, r.item_id)    AS category_score,
       fn_location_proximity(?, r.location_id) AS location_score,
       fn_date_proximity(?, r.report_date)     AS date_score
FROM reports r JOIN items i ON i.item_id = r.item_id
WHERE r.report_type = 'FOUND' AND r.user_id <> ? AND r.report_id <> ?
  AND r.status = 'OPEN' AND ABS(DATEDIFF(r.report_date, ?)) <= 30
  AND (i.category_id = ? OR r.report_id IN (?, ?, …))   -- ids from the MongoDB text search
LIMIT 200;
```

### 8. Idempotent match upsert: no duplicate pairs
`src/lib/repositories/matches.js`
```sql
INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score,
                     category_score, location_score, date_score, matched_attributes, algorithm_version)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE description_score = VALUES(description_score), …;
-- UNIQUE (lost_report_id, found_report_id) is what makes this an upsert.
-- match_score is a STORED generated column, computed by MySQL:
--   ROUND(100*(0.35*d + 0.25*c + 0.15*cat + 0.15*loc + 0.10*date), 2)
```

### 9. One approved claim per item: generated column + UNIQUE
`01_schema.sql`
```sql
approved_report_id INT UNSIGNED
  GENERATED ALWAYS AS (IF(status = 'APPROVED', report_id, NULL)) STORED,
CONSTRAINT uq_claims_one_approved UNIQUE (approved_report_id)
-- NULLs don't collide, so any number of PENDING/REJECTED claims are allowed,
-- but a second APPROVED claim for the same report is a duplicate key.
```

### 10. Claim approval transaction (excerpt)
`02_functions_procedures.sql`
```sql
START TRANSACTION;
SELECT r.status, r.user_id, i.item_name INTO … FROM reports r … WHERE r.report_id = v_report_id
FOR UPDATE;                                         -- serialises competing approvals
SELECT claimant_id, lost_report_id, status INTO … FROM claims WHERE claim_id = p_claim_id FOR UPDATE;
IF v_claim_status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only pending claims can be approved'; END IF;
IF v_report_status <> 'OPEN'   THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This item is no longer open for claims'; END IF;
UPDATE claims  SET status = 'REJECTED', … WHERE report_id = v_report_id AND status = 'PENDING' AND claim_id <> p_claim_id;
UPDATE claims  SET status = 'APPROVED', … WHERE claim_id = p_claim_id;
UPDATE reports SET status = 'RESOLVED' WHERE report_id IN (v_report_id, v_lost_id);
UPDATE matches SET match_status = 'CONFIRMED' WHERE lost_report_id = v_lost_id AND found_report_id = v_report_id;
INSERT INTO notifications … ;
COMMIT;   -- an EXIT HANDLER does ROLLBACK + RESIGNAL on any error
```

### 11. Validation trigger (excerpt)
`04_triggers.sql`
```sql
CREATE TRIGGER trg_claims_bi BEFORE INSERT ON claims FOR EACH ROW
BEGIN
  SELECT report_type, status, user_id INTO v_type, v_status, v_owner FROM reports WHERE report_id = NEW.report_id;
  IF v_type <> 'FOUND' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Claims can only be made on FOUND reports'; END IF;
  IF v_owner = NEW.claimant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot claim an item you reported as found'; END IF;
  …
END
```

### 12. Audit trigger using a session variable
`04_triggers.sql`. The backend runs `SET @app_user_id = ?` on the connection before each write.
```sql
CREATE TRIGGER trg_reports_au AFTER UPDATE ON reports FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO status_audit_log (entity_type, entity_id, old_status, new_status, changed_by)
    VALUES ('REPORT', NEW.report_id, OLD.status, NEW.status, @app_user_id);
  END IF;
END
```

### 13. Transactional outbox write (application transaction)
`src/lib/services/reportService.js` with `repositories/outbox.js`
```sql
START TRANSACTION;
INSERT INTO reports (user_id, item_id, location_id, custody_location_id, report_type, description, report_date) VALUES (?, ?, ?, ?, ?, ?, ?);
INSERT INTO mongo_outbox (report_id, operation, payload) VALUES (?, 'UPSERT', ?);   -- JSON payload
COMMIT;
```

### 14. DDL: ALTER and DROP
`06_alter_migration.sql`
```sql
ALTER TABLE users ADD COLUMN phone VARCHAR(15) NULL AFTER srn,
  ADD CONSTRAINT chk_users_phone CHECK (phone IS NULL OR phone REGEXP '^[+]?[0-9]{10,14}$');
ALTER TABLE notifications MODIFY COLUMN notification_type ENUM(…, 'REMINDER') NOT NULL;
CREATE INDEX idx_reports_date ON reports (report_date);
CREATE TABLE import_staging_reports (…);  DROP TABLE import_staging_reports;
```

---

## MongoDB

### 15. Weighted full-text search
`src/lib/repositories/mongo/itemDetails.js`
```js
db.item_details.createIndex(
  { search_tags: 'text', item_name: 'text', description: 'text' },
  { weights: { search_tags: 10, item_name: 8, description: 4 } });

db.item_details.find({ $text: { $search: 'black bottle red sticker' }, report_type: 'FOUND' },
                     { report_id: 1, score: { $meta: 'textScore' } })
  .sort({ score: { $meta: 'textScore' } }).limit(200);
```

### 16. Idempotent upsert keyed by the MySQL report_id
Used by the outbox, so it's safe to retry.
```js
db.item_details.updateOne(
  { report_id: 101 },
  { $set: { description, characteristics, search_tags, tokens, … },
    $setOnInsert: { created_at: new Date(), images: [] } },
  { upsert: true });
```

### 17. Monthly trend by report type
```js
db.item_details.aggregate([
  { $match: { report_date: { $gte: sixMonthsAgo } } },
  { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$report_date' } }, type: '$report_type' },
              count: { $sum: 1 } } },
  { $group: { _id: '$_id.month', counts: { $push: { k: '$_id.type', v: '$count' } } } },
  { $project: { _id: 0, month: '$_id', counts: { $arrayToObject: '$counts' } } },
  { $sort: { month: 1 } } ]);
```

### 18. Most common colours across differently-shaped documents
This only works because the characteristics are flexible key/value documents.
```js
db.item_details.aggregate([
  { $project: { attrs: { $objectToArray: '$characteristics' } } },
  { $unwind: '$attrs' },
  { $match: { 'attrs.k': { $in: ['color', 'strap_color', 'frame_color', 'keychain_color'] } } },
  { $group: { _id: { $toLower: { $toString: '$attrs.v' } }, count: { $sum: 1 } } },
  { $sort: { count: -1 } }, { $limit: 6 } ]);
```

### 19. Image metadata with a size cap enforced in the query
```js
db.item_details.updateOne(
  { report_id: 101, 'images.2': { $exists: false } },   // fewer than 3 images
  { $push: { images: { file, mime, size, uploaded_at } } });
```

### 20. Schema validation on the collection
`database/mongo/init.js`
```js
db.createCollection('item_details', { validator: { $jsonSchema: {
  required: ['report_id', 'report_type', 'item_name', 'category_id', 'description', 'characteristics', …],
  properties: { report_type: { enum: ['LOST', 'FOUND'] }, images: { maxItems: 3, … }, … } } },
  validationLevel: 'strict', validationAction: 'error' });
```
