# FindIt: Test Cases and Results

**Test run:** 1 Nov 2026 · MySQL 26.7 · MongoDB Atlas (M0) · Node 24 · Next.js 15.5.28

| Suite | Command | Tests | Result |
|---|---|---|---|
| Database (MySQL + MongoDB) | `npm run db:test` | 34 | ✅ 34 passed, 0 failed |
| End-to-end API | `npm run build && npm run test:api` | 45 | ✅ 45 passed, 0 failed |
| Manual UI walkthrough | screenshots in `docs/screenshots/` | 18 | ✅ all as expected |

Both automated suites **rebuild a separate test database** (`findit_test`) from the real scripts before running, so they never touch your demo data. The API suite starts the real production server against the test databases and drives it over HTTP.

---

## 1. Database tests (`database/tests/db.test.js`)

| ID | Area | Test | Expected | Result |
|---|---|---|---|---|
| DB-01 | Seed | Row counts after setup | 25 users, 10 categories, 72 reports, 16 claims | ✅ |
| DB-02 | Seed | Claim outcomes applied through the procedures | 9 approved, 1 rejected, 1 withdrawn, 5 pending; 18 resolved and 2 closed reports | ✅ |
| DB-03 | ALTER | Migration added `users.phone` with a CHECK | Bad phone rejected, valid phone accepted | ✅ |
| DB-04 | Constraint | Invalid email / duplicate email | `chk_users_email` violation / `ER_DUP_ENTRY` | ✅ |
| DB-05 | Constraint | Student without SRN; plain-text password | `chk_users_student_srn` / `chk_users_hash` violation | ✅ |
| DB-06 | Constraint | Custody location on a LOST report | `chk_reports_custody` violation | ✅ |
| DB-07 | Constraint | Summary shorter than 10 characters | `chk_reports_description` violation | ✅ |
| DB-08 | Constraint | Match component score > 1 | CHECK violation | ✅ |
| DB-09 | Trigger | Report dated in the future | `SIGNAL`: "Report date cannot be in the future" | ✅ |
| DB-10 | Trigger | Re-open a RESOLVED report; change report type | Both refused by `trg_reports_bu` | ✅ |
| DB-11 | Trigger | Claim on LOST report / closed report / own report / by admin / linking someone else's lost report / duplicate | Each refused with its own message (or duplicate key) | ✅ |
| DB-12 | Trigger | Change a decided claim back to PENDING | Refused by `trg_claims_bu` | ✅ |
| DB-13 | Trigger | Match a report with itself / LOST+LOST / FOUND+LOST | Refused by `trg_matches_bi` | ✅ |
| DB-14 | Trigger | Audit trail | 72 creation rows; approval and close audited with the acting user's ID | ✅ |
| DB-15 | Generated column | `match_score` = weighted sum of components | (0.5, 1, 1, 0.3, 0.857) gives **70.57**; duplicate pair rejected; status change audited | ✅ |
| DB-16 | Generated column | Two APPROVED claims on one report, bypassing the procedure | Second update fails on `uq_claims_one_approved` | ✅ |
| DB-17 | Function | `fn_location_proximity` | 1.0 same spot · 0.8 same floor · 0.6 same building · 0.3 same zone · 0 elsewhere | ✅ |
| DB-18 | Function | `fn_date_proximity`, `fn_category_similarity` | 0.929 for 1 day; 0 if found before lost; 1 / 0.6 / 0 by item and category | ✅ |
| DB-19 | View | `v_report_card`, `v_unresolved_reports`, `v_active_lost_reports`, `v_recovery_stats`, `v_pending_claims` | Correct joins, no password column, correct aggregates | ✅ |
| DB-20 | Procedure | `sp_recovery_summary` | 3 result sets; the category set honours `HAVING COUNT(*) >= 2` | ✅ |
| DB-21 | Procedure | `sp_reports_by_user`, `sp_reports_by_category` | Correct rows and filters | ✅ |
| DB-22 | Index | `EXPLAIN` of the browse query | Uses `idx_reports_browse` (covering range scan) | ✅ |
| DB-23 | Transaction | A student calls `sp_approve_claim` | Refused; claim still PENDING | ✅ |
| DB-24 | Transaction | Approve an already-approved claim | Refused: "Only pending claims can be approved" | ✅ |
| DB-25 | Transaction | Approve a claim with a linked lost report | Found and lost reports both RESOLVED; 2 notifications | ✅ |
| DB-26 | Concurrency | **Two admins approve competing claims at the same moment** (two connections) | Exactly one succeeds, the other is rejected; no deadlock | ✅ |
| DB-27 | Transaction | `sp_reject_claim` | Claim REJECTED, report stays OPEN, claimant notified | ✅ |
| DB-28 | MongoDB | Every MySQL report has exactly one `item_details` document; all SYNCED | Sets equal | ✅ |
| DB-29 | MongoDB | Category-specific characteristics | Laptop has `model`; keys have `number_of_keys` and no `model` | ✅ |
| DB-30 | Text index | Search "black bottle red sticker" | Reports 1 and 2 ranked first | ✅ |
| DB-31 | Validator / index | Duplicate `report_id`; document missing fields; invalid enum | Error 11000; error 121; error 121 | ✅ |
| DB-32 | Aggregation | Most frequently lost categories | Electronics first, sorted descending | ✅ |
| DB-33 | Aggregation | Most common colours (`$objectToArray`) | "black" first | ✅ |
| DB-34 | Aggregation | Monthly trend (`$dateToString`) | Aug, Sep, Oct 2026; total 72 | ✅ |

## 2. API tests (`tests/api.test.js`)

| ID | Area | Test | Expected | Result |
|---|---|---|---|---|
| API-01 | Public | `GET /api/catalog` | 10 categories, each with template fields | ✅ |
| API-02 | Public | Browse with type/status filters and paging | 5 items, all FOUND and OPEN; no internal fields | ✅ |
| API-03 | Search | `?q=black bottle red sticker` | Reports 1 and 2 first | ✅ |
| API-04 | Security | SQL text in `q`; `category=1 OR 1=1` | 200 with no effect / 400; table intact (72 rows) | ✅ |
| API-05 | Privacy | Anonymous item detail | Matches and claims hidden | ✅ |
| API-06 | Validation | Register with bad name, email and password | 400 with per-field messages | ✅ |
| API-07 | Auth | Register | 201, session cookie, bcrypt `$2b$10$` hash stored | ✅ |
| API-08 | Auth | Duplicate email | 409 | ✅ |
| API-09 | Security | 5 wrong passwords, then a 6th attempt | 401 ×5, then **429** | ✅ |
| API-10 | Auth | Seed student and admin login | 200; role ADMIN for the admin | ✅ |
| API-11 | RBAC | Anonymous write / dashboard | 401 | ✅ |
| API-12 | RBAC | Student calls admin stats, approve, role change | 403 | ✅ |
| API-13 | RBAC | Admin submits a claim | 403 (students only) | ✅ |
| API-14 | Security | POST with a foreign `Origin` header | 403 (CSRF block) | ✅ |
| API-15 | Middleware | `/dashboard` while signed out | 307 redirect to `/login?next=/dashboard` | ✅ |
| API-16 | Integration | Create LOST report | 201, `synced: true`, ≥1 match, MongoDB doc with tags, outbox empty | ✅ |
| API-17 | Matching | Owner views the report | Best match is report 2, ≥60%, explanation includes Colour and Same item type | ✅ |
| API-18 | Notifications | Strong match | Both owners get MATCH_FOUND | ✅ |
| API-19 | Validation | Future date, unknown characteristic key, invalid option, custody on LOST | 400 each, with field errors | ✅ |
| API-20 | Ownership | Another student edits my report / I edit it | 403 / 200 and MongoDB updated | ✅ |
| API-21 | Procedure | Dashboard | `sp_reports_by_user` rows with `best_match_score` | ✅ |
| API-22 | Upload | Valid PNG | 201; served with `image/png` and `nosniff` | ✅ |
| API-23 | Upload | Script renamed to `.png` | 400 (magic-byte check) | ✅ |
| API-24 | Upload | Path traversal `../../.env.local` | 404 | ✅ |
| API-25 | Upload | Another user uploads to my report | 403 | ✅ |
| API-26 | Claims | Claim own report / LOST report / someone else's lost link | 409 with the trigger's message | ✅ |
| API-27 | Claims | Submit a claim, then a duplicate | 201 / 409 | ✅ |
| API-28 | Claims | Admin queue | Both claims on report 2, `competing_claims = 2` | ✅ |
| API-29 | Transaction | Approve | Claim APPROVED, both reports RESOLVED, competitor REJECTED, match CONFIRMED, both notified | ✅ |
| API-30 | Transaction | Approve again / withdraw an approved claim | 409 / 409 | ✅ |
| API-31 | Lifecycle | Edit a resolved report | 409 | ✅ |
| API-32 | Claims | Withdraw someone else's claim / your own | 404 / 200 | ✅ |
| API-33 | Integrity | Delete reports involved in claims; delete someone else's report | 409 / 409 / 403 | ✅ |
| API-34 | Lifecycle | Close own report twice | 200, then 409 | ✅ |
| API-35 | Consistency | Delete a claim-free report | MySQL row and MongoDB doc both gone | ✅ |
| API-36 | **Consistency** | Simulated MongoDB outage (report + outbox entry left FAILED) plus an orphan doc, then `POST /api/admin/sync` | Doc delivered, report SYNCED, orphan removed, outbox empty | ✅ |
| API-37 | Analytics | `GET /api/admin/stats` | MySQL totals and hotspots (HAVING ≥ 2); MongoDB colours ("black" first) and monthly trend | ✅ |
| API-38 | Procedure | `?from&to` | `sp_recovery_summary` result | ✅ |
| API-39 | Matches | Dismiss a suggestion; change a confirmed match | 200 / 400 | ✅ |
| API-40 | Security | Deactivate a user, then reactivate | Their session gets 401 immediately, then 200 | ✅ |
| API-41 | Admin | Admin demotes self | 400 | ✅ |
| API-42 | Integrity | Delete a location in use / add a duplicate / add and delete a new one | 409 / 409 / 201 + 200 | ✅ |
| API-43 | MongoDB | Save a template with an invalid key / a valid one | 400 / 200 and visible in the catalogue | ✅ |
| API-44 | Notifications | Mark all read; delete own; delete someone else's | unread = 0 / 200 / 404 | ✅ |
| API-45 | Auth | Logout | `/api/auth/me` returns null | ✅ |

## 3. Manual UI checks

Checked in a real browser (headless Edge) at 1280 px and 390 px (phone) width.

| ID | Page | Check | Result |
|---|---|---|---|
| UI-01 | Landing | Live counters (72 / 9 / 52), recent items, how-it-works, search | ✅ |
| UI-02 | Browse | Filters update the URL, default "Open", sort, pagination (5 pages) | ✅ |
| UI-03 | Item detail (public) | Characteristics, custody location, "Log in to claim", activity timeline | ✅ |
| UI-04 | Item detail (owner) | Match card with explanation chips and score breakdown; Edit, Add photo, Close | ✅ |
| UI-05 | Item detail (owner) | Delete hidden when a claim references the report | ✅ |
| UI-06 | Report form | Category leads to item type; building leads to area; fields generated from the MongoDB template | ✅ |
| UI-07 | Report form | Found items default custody to the Security Office | ✅ |
| UI-08 | Dashboard | Stat tiles, Lost/Found tabs (`sp_reports_by_user`), matches, claims, notifications | ✅ |
| UI-09 | Claims | Progress steps, approved banner with pickup info, withdraw dialog | ✅ |
| UI-10 | Notifications | Unread dot, mark all read, delete | ✅ |
| UI-11 | Admin overview | Tiles, monthly chart, category, hotspot, colour and brand charts, recovery table, unresolved, unmatched, audit trail, sync panel | ✅ |
| UI-12 | Admin overview | Each panel labelled with its data source (MySQL view or procedure, or MongoDB pipeline) | ✅ |
| UI-13 | Admin claims | Competing claims grouped, match badges, approve/reject dialogs, recent decisions | ✅ |
| UI-14 | Admin matches | Side-by-side lost and found, explanation, confirm/dismiss/restore | ✅ |
| UI-15 | Admin users | Search, counts, deactivate/reactivate, role change; own row protected | ✅ |
| UI-16 | Admin catalogue | Add/delete location, building, item type, category; template editor saves to MongoDB | ✅ |
| UI-17 | Responsive | Phone width: collapsing menu, stacked layouts, no horizontal scrolling | ✅ |
| UI-18 | Charts | Colourblind-safe palette (validated), value labels, "Show table" alternative, hover tooltips | ✅ |

## Defects found and fixed during testing

| Found by | Defect | Fix |
|---|---|---|
| DB-26 design review | Competing approvals could deadlock (claim rows locked before the report) | `sp_approve_claim` locks the found report first |
| Matching review | Stemmer turned "bottles" into "bottl" | Plural rule limited to -sses/-xes/-ches/-shes |
| API-02 | Public listings exposed `mongo_sync_status` | Stripped from public cards |
| UI-05 | Delete button shown for a report linked to a claim | API now returns `canDelete` |
| UI-11 | Chart axis showed 12.5; audit trail said "Match #13" | Even axis maximum; activity names the item |
| Dependency audit | Next.js 15.5.4 had a middleware-bypass advisory; zod 3 had a memory-exhaustion advisory | Upgraded to Next 15.5.28 and zod 4.6.7 |
