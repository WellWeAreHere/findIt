# FindIt: Demonstration Script (about 15 minutes)

**Before the demo**
- Run `npm run db:setup`. It resets both databases to the seed data.
- Run `npm run build`, then `npm start`.
- Open http://localhost:3000 in one normal window and one private window.
- Open a MySQL client on the side, such as MySQL Workbench or the `mysql` CLI.

**Accounts** (all use the password `Password@123`)

| Role | Name | Email | Why use them |
|---|---|---|---|
| Admin | Dr. Meera Raghavan | `meera.raghavan@university.edu` | Admin pages |
| Student | Rahul Menon | `rahul.menon@university.edu` | Owns lost bottle #1 and has a pending claim |
| Student | Divya Krishnan | `divya.krishnan@university.edu` | Found bottle #2 |
| Student | Priya Sharma | `priya.sharma@university.edu` | Competing claim on backpack #28 |
| Student | Pooja Bhat | `pooja.bhat@university.edu` | Competing claim on backpack #28 |

---

## 1. Problem and design (2 min)
- Problem: lost items on campus have no central place, so finders and owners never meet.
- Show `docs/er-diagram.mmd` rendered (VS Code, GitHub, or mermaid.live). Point out:
  - Building → Location, split for 3NF
  - Claim as an M:N relationship with attributes
  - Match as a recursive M:N
- **Why two databases:**
  - **MySQL** holds anything with relationships, ownership or a lifecycle: users, reports, claims, matches, the audit log.
  - **MongoDB** holds what has no fixed shape: per-category characteristics, search tags, images, the activity log and category templates. They're linked by `report_id`.

## 2. Public site (1 min)
- Landing page: the live counters come from the `/api/stats` SQL aggregate.
- **Browse**: search "black bottle red sticker". This uses the MongoDB weighted text index. Then filter by category or building; that filtering happens in MySQL against `v_report_card`.

## 3. Report an item: dynamic form, both databases, matching (3 min)
1. Log in as a new student (register live, or use Rahul).
2. **Report item → I found something → Bags → Backpack.** Point out the extra fields. They're generated from the MongoDB `category_templates` document, so every category asks different questions.
3. Fill in a grey Wildcraft backpack at the Auditorium entrance, dated today, and submit.
4. The page shows "We found N potential matches". Open one and explain the **score breakdown**: 35/25/15/15/10 weights, plus the "Why we think so" chips.
5. In MySQL, show what happened in that one transaction:
   ```sql
   SELECT report_id, status, mongo_sync_status FROM reports ORDER BY report_id DESC LIMIT 1;
   SELECT * FROM status_audit_log ORDER BY audit_id DESC LIMIT 3;   -- written by the trigger
   SELECT lost_report_id, found_report_id, match_score, matched_attributes FROM matches ORDER BY match_id DESC LIMIT 3;
   SELECT COUNT(*) FROM mongo_outbox;   -- 0: delivered to MongoDB and cleared
   ```

## 4. Database rules in action (2 min)
In MySQL, show that the **database itself** refuses bad data:
```sql
INSERT INTO reports (user_id,item_id,location_id,report_type,description,report_date)
  VALUES (3,1,1,'LOST','Report from the future', CURDATE() + INTERVAL 1 DAY);     -- trigger SIGNAL
INSERT INTO claims (report_id, claimant_id, claim_description)
  VALUES (2, 10, 'I am trying to claim the item I found myself');                  -- trigger SIGNAL
UPDATE reports SET status = 'OPEN' WHERE report_id = 4;                            -- resolved cannot reopen
```

## 5. Claim, then the admin approval transaction (3 min)
1. As **Rahul**, open found item #2 (the black bottle). He already has a pending claim, and the claim panel shows it.
2. Log in as **admin** (private window) and go to **Admin → Claims**.
3. Point out the **Backpack #28** card: *2 competing claims*. Approve Priya's claim, which has the keychain detail and a 73% match.
4. Explain that one stored procedure, `sp_approve_claim`, did all of this as one transaction:
   - Locked the item row (`SELECT … FOR UPDATE`)
   - Approved Priya's claim and rejected Pooja's
   - Marked the found and lost reports RESOLVED
   - Confirmed the match
   - Inserted three notifications
5. Prove it in MySQL:
   ```sql
   SELECT claim_id, status, review_note FROM claims WHERE report_id = 28;
   SELECT report_id, status FROM reports WHERE report_id IN (27, 28);
   ```
6. Mention the **generated-column UNIQUE** (`uq_claims_one_approved`). Even if two admins click Approve at the same moment, at most one approved claim can exist. The test `DB-26` proves it.
7. Log in as Pooja: there's a "not approved" notification. Log in as Priya: her claim is APPROVED, with pickup instructions.

## 6. Admin analytics: SQL and MongoDB side by side (2 min)
Open **Admin → Overview**. Every panel is labelled with its source:
- **MySQL:**
  - `v_recovery_stats` (view)
  - hotspots (GROUP BY … HAVING)
  - unmatched lost items (NOT EXISTS)
  - `v_unresolved_reports` (correlated subqueries)
  - recent activity (the trigger-written audit log)
- **MongoDB:**
  - monthly trend (`$dateToString`)
  - most-lost categories (`$group`)
  - colours and brands (`$objectToArray`, only possible because characteristics are flexible)
- Click **Show table** on a chart (accessibility).

## 7. Consistency between the databases (1 min)
- **Admin → Overview → MySQL → MongoDB sync → Re-sync now.**
- Explain the outbox: if MongoDB is down when a report is submitted, the report and its full details are saved in MySQL in the same transaction. The background reconciler (every 5 minutes) delivers them later. Nothing is lost, and orphan documents are cleaned up.
- The test `API-36` simulates exactly this outage.

## 8. Security (1 min)
- Passwords: `SELECT password_hash FROM users LIMIT 1;` shows bcrypt.
- As a student, open http://localhost:3000/admin: you're redirected. Calling the API directly returns `403`.
- Deactivate a student in **Admin → Users**: their open session stops working immediately, because the role is re-read from MySQL on every request.
- Upload a renamed text file as a "photo": it's rejected by the magic-byte check.

## 9. Tests (30 s)
```
npm run db:test     # 34 database tests
npm run test:api    # 45 end-to-end API tests
```
