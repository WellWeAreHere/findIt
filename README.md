# FindIt: Intelligent Campus Lost & Found Management System

A campus lost-and-found platform where students report lost and found items, browse and search everything that has been handed in, get **automatically matched** with likely counterparts, and **claim** their belongings through an admin-verified, transactional workflow.

Built for the DBMS Level 3 project. It uses **MySQL** (system of record) together with **MongoDB** (flexible item data and search), with a **Next.js** web application on top.

![Landing page](docs/screenshots/01-landing.png)

---

## Contents
1. [Problem statement](#1-problem-statement)
2. [Objectives](#2-objectives)
3. [Scope](#3-scope)
4. [Features](#4-features)
5. [Technology stack](#5-technology-stack)
6. [System architecture](#6-system-architecture)
7. [Why both MySQL and MongoDB](#7-why-both-mysql-and-mongodb)
8. [Database design: ER diagram and relational schema](#8-database-design)
9. [MongoDB document structure](#9-mongodb-document-structure)
10. [Consistency between the two databases](#10-consistency-between-the-two-databases)
11. [The matching algorithm](#11-the-matching-algorithm)
12. [Advanced database concepts](#12-advanced-database-concepts)
13. [Important queries](#13-important-queries)
14. [Security and data integrity](#14-security-and-data-integrity)
15. [Installation and running](#15-installation-and-running)
16. [Environment variables](#16-environment-variables)
17. [Testing](#17-testing)
18. [Screenshots](#18-screenshots)
19. [Project structure](#19-project-structure)
20. [Team contributions](#20-team-contributions)
21. [Conclusion and future enhancements](#21-conclusion-and-future-enhancements)

---

## 1. Problem statement
On a busy campus, belongings such as bottles, ID cards, laptops and keys are lost every day. There is no single place to report them. Found items pile up at a security desk, owners don't know where to look, and the two sides rarely meet. Notice boards and chat groups are unsearchable, unverifiable, and leave no record of who returned what to whom.

## 2. Objectives
- Provide **one place** to report lost and found items with rich, item-specific detail.
- **Automatically suggest matches** between lost and found reports using a transparent, explainable scoring algorithm.
- Make ownership claims **verifiable and safe**: admin-reviewed, atomic, and never more than one owner per item.
- Keep a **complete, tamper-evident history** of every status change.
- Give administrators **analytics**: what gets lost, where, and how often it is recovered.
- Demonstrate sound **relational design** (3NF, constraints, triggers, procedures, transactions) alongside appropriate **NoSQL** use.

## 3. Scope
**In scope:**
- Student registration and login, with student and admin roles
- Lost and found reports with photos
- Search and filtering
- Automatic matching with explanations
- Claims with admin approval and rejection
- In-app notifications
- Admin analytics, user management and catalogue management
- Category templates
- Database consistency tooling

**Out of scope:**
- Email or SMS delivery: notifications are in-app.
- Single sign-on with the university directory.
- Payments.
- Native mobile apps: the web app is responsive instead.
- Semantic or embedding-based matching: the architecture is ready for it (see §21).

## 4. Features

| For students | For administrators |
|---|---|
| Register with university email and SRN; secure login | Analytics dashboard combining MySQL and MongoDB |
| Report **lost** or **found** items. The form adapts its questions to the category, e.g. brand, model, sticker for bottles; number of keys, keychain for keys | **Claim review queue**: competing claims grouped; approve or reject as one transaction |
| Up to 3 photos per report (validated server-side) | **Match review**: confirm or dismiss suggested matches |
| Browse and keyword search with filters: type, status, category, building, date range | **User management**: deactivate or reactivate, change role |
| Item pages with characteristics, location, custody point and activity timeline | **Catalogue**: buildings, locations, categories, item types |
| **Potential matches** with a score and "why we think so" explanation | **Template editor** for per-category characteristics (MongoDB) |
| Claim an item with proof of ownership; withdraw; track status | **Re-sync** MySQL → MongoDB; re-run matching |
| Dashboard: my lost and found reports, matches, claims, notifications | Recent-activity feed from the trigger-maintained audit log |
| Notifications for new matches and claim decisions | |

## 5. Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Backend | Next.js Route Handlers on Node.js 20+, with a service and repository layer |
| SQL database | **MySQL 8+** (developed on MySQL 26.7) via `mysql2`, using prepared statements and **no ORM**, so all SQL is visible |
| NoSQL database | **MongoDB** (Atlas free tier or local) via the official `mongodb` driver |
| Auth | `bcryptjs` password hashing; `jose` signed JWT in an httpOnly cookie |
| Validation | `zod` on every API input |
| Version control | Git and GitHub |

Libraries beyond the mandated stack are only those listed here, each needed for a specific job: database drivers, hashing, token signing and validation.

## 6. System architecture

```mermaid
flowchart LR
  UI["Next.js pages<br/>(React + Tailwind)"] -->|fetch /api/*| API["Route handlers<br/>auth guard + zod validation"]
  MW["Middleware<br/>page guard + CSRF check"] -.-> UI
  API --> S["Services<br/>report · matching · claim · notification<br/>sync · analytics · catalog · auth · upload"]
  S --> RM["MySQL repositories<br/>(all SQL lives here)"]
  S --> RN["MongoDB repositories"]
  RM --> MY[("MySQL<br/>system of record")]
  RN --> MO[("MongoDB<br/>item details · templates · activity")]
  S --> FS[/"uploads/ (disk)"/]
  BG["Background reconciler<br/>(instrumentation.js, every 5 min)"] --> S
```

- **Route handlers are thin.** They authenticate, validate with zod, call one service, and return JSON.
- **Services hold the business rules.** For example, `reportService` writes the report and its outbox entry in one transaction, then syncs and runs matching.
- **Repositories hold every query**, with parameters only.
- **The database enforces the rules too**, through constraints, triggers and procedures. So does the API, which gives users friendly messages.

## 7. Why both MySQL and MongoDB

| Data | Stored in | Why |
|---|---|---|
| Users, roles, credentials | MySQL | Uniqueness (email, SRN), referential integrity, CHECK rules |
| Reports: type, status, dates, place, owner | MySQL | Lifecycle with strict status transitions; joined everywhere; must be authoritative |
| Claims, matches, notifications, audit log | MySQL | M:N relationships with attributes; transactions; "one approved claim" guarantee |
| Buildings, locations, categories, item types | MySQL | Small, stable, relational catalogue (Location N:1 Building, Item N:1 Category) |
| **Item characteristics** | MongoDB | Different attributes per category (a laptop has model and specs; keys have count and keychain). In SQL this would need an EAV table, which is untyped and needs many self-joins. |
| **Long description, search tags, tokens** | MongoDB | Free text with a **weighted full-text index** |
| **Images metadata** | MongoDB | Variable-length list (0–3), always read with the item |
| **Category templates** | MongoDB | Nested, ordered field definitions with options and weights, read and written whole |
| **Activity history** | MongoDB | Append-only, high-volume events whose payload shape differs per event |

The two databases are linked by **`report_id`**, the MySQL primary key, which is also a unique index in MongoDB. There is no cross-database foreign key; the backend owns the relationship (§10). **Report status lives only in MySQL**, so MongoDB can never show a stale status.

## 8. Database design

The full design, with every column, constraint and design decision, is in **[docs/01-design.md](docs/01-design.md)**. The editable ER source is [docs/er-diagram.mmd](docs/er-diagram.mmd).

### ER diagram
```mermaid
erDiagram
  USERS ||--o{ REPORTS : files
  USERS ||--o{ CLAIMS : submits
  USERS |o--o{ CLAIMS : reviews
  USERS |o--o{ MATCHES : reviews
  USERS ||--o{ NOTIFICATIONS : receives
  CATEGORIES ||--o{ ITEMS : groups
  BUILDINGS ||--o{ LOCATIONS : contains
  ITEMS ||--o{ REPORTS : "is type of"
  LOCATIONS ||--o{ REPORTS : "occurred at"
  LOCATIONS |o--o{ REPORTS : "held in custody at"
  REPORTS ||--o{ CLAIMS : "claimed (FOUND)"
  REPORTS |o--o{ CLAIMS : "evidence (LOST)"
  REPORTS ||--o{ MATCHES : "lost side"
  REPORTS ||--o{ MATCHES : "found side"
  REPORTS |o--o{ NOTIFICATIONS : "about"

  USERS {
    int user_id PK
    varchar name
    varchar email UK
    varchar srn UK
    char password_hash
    enum role
    bool is_active
    datetime created_at
  }
  CATEGORIES {
    int category_id PK
    varchar category_name UK
    varchar description
  }
  ITEMS {
    int item_id PK
    int category_id FK
    varchar item_name
  }
  BUILDINGS {
    int building_id PK
    varchar building_name UK
    enum zone
  }
  LOCATIONS {
    int location_id PK
    int building_id FK
    tinyint floor
    varchar area
  }
  REPORTS {
    int report_id PK
    int user_id FK
    int item_id FK
    int location_id FK
    int custody_location_id FK
    enum report_type
    varchar description
    date report_date
    enum status
    enum mongo_sync_status
    tinyint sync_attempts
    datetime created_at
    datetime updated_at
  }
  CLAIMS {
    int claim_id PK
    int report_id FK
    int claimant_id FK
    int lost_report_id FK
    text claim_description
    enum status
    int reviewed_by FK
    varchar review_note
    datetime reviewed_at
    datetime created_at
    int approved_report_id "generated, UK"
  }
  MATCHES {
    int match_id PK
    int lost_report_id FK
    int found_report_id FK
    decimal description_score
    decimal characteristics_score
    decimal category_score
    decimal location_score
    decimal date_score
    decimal match_score "generated"
    json matched_attributes
    enum match_status
    varchar algorithm_version
    int reviewed_by FK
    datetime created_at
  }
  NOTIFICATIONS {
    int notification_id PK
    int user_id FK
    int related_report_id FK
    varchar message
    enum notification_type
    bool is_read
    datetime created_at
  }
  STATUS_AUDIT_LOG {
    bigint audit_id PK
    enum entity_type
    int entity_id
    varchar old_status
    varchar new_status
    int changed_by
    datetime changed_at
  }
```

### Relational schema (summary)
PK = primary key, FK = foreign key, UK = unique key.

| Table | Primary key | Foreign keys | Key constraints |
|---|---|---|---|
| `users` | user_id | – | UK email, UK srn; CHECK email format, name length, students need an SRN, bcrypt hash format; ENUM role |
| `categories` | category_id | – | UK category_name |
| `items` | item_id | category_id → categories | UK (category_id, item_name) |
| `buildings` | building_id | – | UK building_name; ENUM zone |
| `locations` | location_id | building_id → buildings | UK (building_id, floor, area); CHECK floor −2..15 |
| `reports` | report_id | user_id → users, item_id → items, location_id → locations, custody_location_id → locations | CHECK summary length, custody only on FOUND, date ≥ 2020; ENUM type, status, sync status; 4 composite indexes |
| `claims` | claim_id | report_id → reports, claimant_id → users, lost_report_id → reports, reviewed_by → users | UK (report_id, claimant_id); **generated `approved_report_id` + UK** (one approval per item); CHECK review fields consistent with status |
| `matches` | match_id | lost_report_id → reports (CASCADE), found_report_id → reports (CASCADE), reviewed_by → users | UK (lost, found); CHECK each component in [0,1]; **generated `match_score`** |
| `notifications` | notification_id | user_id → users (CASCADE), related_report_id → reports (SET NULL) | index (user_id, is_read, created_at) |
| `status_audit_log` | audit_id | none by design (history outlives rows) | written only by triggers |
| `mongo_outbox` | outbox_id | none by design (DELETE entries outlive the report) | CHECK payload present for UPSERT |

**Normalisation:**
- All tables are in **3NF/BCNF**. Building → zone is split out of locations, and item → category is split out of reports.
- Multi-valued data goes to MongoDB, never into comma-separated columns.
- Derived values are generated columns, not copies.

**Cardinalities:**
- User 1:N Report
- Category 1:N Item, Building 1:N Location
- Item 1:N Report, Location 1:N Report
- User M:N Report through **Claim**
- Report M:N Report (LOST ↔ FOUND) through **Match**
- User 1:N Notification

**SQL scripts** (run in order by `npm run db:setup`):

| File | Contents |
|---|---|
| [`01_schema.sql`](database/mysql/01_schema.sql) | DROP + CREATE tables, keys, constraints, indexes |
| [`02_functions_procedures.sql`](database/mysql/02_functions_procedures.sql) | 4 functions, 5 procedures |
| [`03_views.sql`](database/mysql/03_views.sql) | 5 views |
| [`04_triggers.sql`](database/mysql/04_triggers.sql) | 10 triggers |
| [`05_seed.sql`](database/mysql/05_seed.sql) | Seed data, generated from [`database/seed/data.js`](database/seed/data.js) |
| [`06_alter_migration.sql`](database/mysql/06_alter_migration.sql) | ALTER / DROP migration |
| [`07_sync_outbox.sql`](database/mysql/07_sync_outbox.sql) | Outbox migration |

## 9. MongoDB document structure

Database `findit`. Three collections, each with a `$jsonSchema` validator: [`database/mongo/init.js`](database/mongo/init.js).

**`item_details`**: one document per report.
```json
{
  "report_id": 101,
  "report_type": "LOST",
  "item_name": "Water Bottle", "category_id": 2, "category_name": "Bottles & Flasks",
  "building_name": "Central Library", "report_date": "2026-10-28T00:00:00Z",
  "description": "Black Milton Thermosteel bottle, 1 litre, red sticker of a guitar near the cap…",
  "characteristics": { "color": "black", "brand": "Milton", "material": "steel", "capacity": "1 litre", "sticker": "red guitar sticker" },
  "search_tags": ["water bottle", "bottles & flasks", "black", "milton", "steel", "1 litre", "red guitar sticker"],
  "tokens": ["water", "bottle", "black", "milton", "thermosteel", "litre", "red", "sticker", "guitar", "cap"],
  "images": [{ "file": "3f9c…e1.webp", "mime": "image/webp", "size": 184233, "uploaded_at": "…" }],
  "embedding": null, "schema_version": 1, "created_at": "…", "updated_at": "…"
}
```
A keys document instead has `"characteristics": { "number_of_keys": 3, "keychain_color": "blue", "accessories": "bottle opener, Honda key" }`.

The denormalised fields (`report_type`, `category_*`, `building_name`, `report_date`) are a write-once search snapshot. They let text search and aggregations run without cross-database joins.

Indexes:
- **Unique** on `report_id`
- **Weighted text index** on `search_tags` (10), `item_name` (8) and `description` (4)
- `{category_id, report_type, report_date}`
- Sparse `characteristics.color`

**`category_templates`**: one per category, e.g. `{ category_id: 2, fields: [{ key: "sticker", label: "Stickers", type: "text", match_weight: 3 }, …] }`. These drive the dynamic report form and the matching weights.

**`report_activity`**: append-only events, e.g. `{ report_id: 101, event: "MATCH_RUN", actor_id: null, at: …, data: { candidates: 14, stored: 2 } }`.

## 10. Consistency between the two databases
**Strategy: MySQL first, transactional outbox, idempotent upserts.** Implemented in [`syncService.js`](src/lib/services/syncService.js).

1. **One MySQL transaction** writes the report and an outbox row containing the full MongoDB document as JSON.
2. The document is **upserted** into MongoDB by `report_id`. Repeating this is harmless. Then the outbox row is deleted and the report is marked `SYNCED`.
3. **If MongoDB is unavailable**, the outbox row stays and the report is marked `FAILED`. The student still gets their report. **Nothing is lost**, because the details are safe in the outbox.
4. A **reconciler** replays the outbox: on server start, every 5 minutes, and from the admin "Re-sync now" button. It also deletes **orphan** documents whose MySQL row no longer exists.
5. **Deletes** go the same way, through a `DELETE` outbox entry.

MySQL is never rolled back because MongoDB failed, since the authoritative record exists. Test `API-36` simulates an outage end to end.

## 11. The matching algorithm
A transparent weighted score (`weighted-v1`), in [`matching/scorer.js`](src/lib/matching/scorer.js) and [`matchingService.js`](src/lib/services/matchingService.js). **It is not AI.** Every point can be explained.

| Component | Weight | How it's computed |
|---|---|---|
| Description | 35% | Jaccard similarity of normalised word sets (lowercase, stop-words removed, plural stemming, tags included) |
| Characteristics | 25% | Weighted share of the attributes **both** reports have that agree: equal, one contains the other, or most words shared. Weights come from the category template. Neutral 0.5 if nothing is comparable. |
| Category | 15% | SQL `fn_category_similarity`: same item type 1.0, same category 0.6 |
| Location | 15% | SQL `fn_location_proximity`: same spot 1.0, same floor 0.8, same building 0.6, same campus zone 0.3 |
| Date | 10% | SQL `fn_date_proximity`: linear decay over 14 days; 0 if "found" before "lost" |

**Score = 100 × Σ weight × component.** MySQL stores it as a generated column.

**When it runs:** whenever a report is created or edited. It compares LOST reports only with FOUND reports, never a report with itself or with the same person's report. Candidates come from MySQL (same category, within 30 days) plus a **MongoDB text search** on the report's tags.

**What's stored:**
- Pairs scoring **≥ 40** are upserted. A unique (lost, found) pair key means there are never duplicates.
- Pairs scoring **≥ 60** notify both owners.
- Each match stores a `matched_attributes` explanation, e.g. *Colour: black · Material: steel · Same building and floor · 1 day apart*.

On the seed data, all **22** real lost/found pairs are found and ranked top (64–88), and decoys stay below 50. The example from the brief (black Milton bottle, red sticker, library) scores **71.9**.

**Extensible:** a scorer is any object with `score({lost, found, sql, fields})`, and each match records `algorithm_version`. Every document already has an `embedding` field reserved for a future semantic scorer.

## 12. Advanced database concepts
The brief asks for at least four. FindIt implements nine, and the application uses each one.

| # | Concept | Implementation | Used by the application when… |
|---|---|---|---|
| 1 | **Transactions** | `sp_approve_claim` / `sp_reject_claim` (`START TRANSACTION`, `SELECT … FOR UPDATE`, `ROLLBACK` + `RESIGNAL`); application transactions for report and outbox writes and match persistence | An admin approves a claim; a report is created or edited; matching stores results |
| 2 | **Triggers** | 10 triggers: validation (`trg_reports_bi/bu`, `trg_claims_bi/bu`, `trg_matches_bi`) and audit (`*_ai`, `*_au`) | Every insert or update. The API shows the trigger's message. The admin activity feed reads the audit log. |
| 3 | **Views** | `v_report_card`, `v_active_lost_reports`, `v_unresolved_reports`, `v_recovery_stats`, `v_pending_claims` | Browse, item pages, admin "longest unresolved", recovery table, claim queue |
| 4 | **Stored procedures and functions** | `sp_approve_claim`, `sp_reject_claim`, `sp_recovery_summary` (3 result sets), `sp_reports_by_user`, `sp_reports_by_category`; `fn_location_proximity`, `fn_date_proximity`, `fn_category_similarity`, `fn_days_open` | Claims, student dashboard, admin date-range summary, the matching candidate query |
| 5 | **Indexing** | Composite B-tree indexes, e.g. `idx_reports_browse (type, status, date)`, verified with `EXPLAIN` | Browse, dashboard, matching, notifications inbox |
| 6 | **Generated columns + unique constraint** | `matches.match_score`; `claims.approved_report_id` with UNIQUE | Match scores can't drift from components; at most one approved claim per item, even under concurrency |
| 7 | **Full-text search** | MongoDB weighted text index | Browse search box; matching candidate expansion |
| 8 | **NoSQL aggregation** | `$group`, `$dateToString`, `$objectToArray`, `$unwind`, `$arrayToObject` pipelines | Admin charts: monthly trend, most-lost categories, colours, brands, tags |
| 9 | **DDL lifecycle** | `DROP … IF EXISTS` / `CREATE`; migrations with `ALTER TABLE`, `CREATE INDEX`, `DROP TABLE` | Database setup and migrations v2/v3 |

**DML coverage:**
- **INSERT:** reports, claims, matches, notifications
- **UPDATE:** status changes, notifications read, edits
- **DELETE:** reports, notifications, locations, items
- **SELECT:** JOIN, GROUP BY / HAVING, ORDER BY, aggregates, correlated and `NOT EXISTS` subqueries

## 13. Important queries
About twenty annotated SQL and MongoDB queries from the code are in **[docs/queries.md](docs/queries.md)**: JOIN views, GROUP BY/HAVING, NOT EXISTS, the matching candidate query using stored functions, the approval transaction, triggers, text search and aggregation pipelines.

## 14. Security and data integrity

| Requirement | Implementation |
|---|---|
| Secure passwords | bcrypt (cost 10); a CHECK refuses non-bcrypt values; constant-time login even for unknown emails |
| No hard-coded secrets | Everything is in `.env.local` (gitignored); `.env.example` has placeholders only |
| Authentication | HS256-signed JWT in an **httpOnly, SameSite=Lax** cookie, 7 days |
| Role-based access | Middleware guards pages. **Every API route re-checks role and active status in MySQL**, so deactivation takes effect immediately. |
| Ownership | Only owners edit, close or delete their reports and images; only claimants withdraw their claims; notifications are scoped to their user |
| SQL injection | Prepared statements with `?` everywhere; whitelisted sort columns; only validated integers inlined (LIMIT) |
| NoSQL injection | zod validation; characteristic keys must exist in the category template; user text only ever reaches `$search` |
| Input validation | zod on every request **and** database constraints and triggers ("validation at the database level", brief item 12) |
| Uploads | JPEG/PNG/WebP detected by **magic bytes**, max 5 MB and 3 per report, random file names, stored outside `public/`, served with `nosniff` and CSP; path traversal refused |
| CSRF | SameSite cookie, plus cross-origin state-changing requests rejected |
| Brute force | 5 failed logins per email and client per 15 minutes, then HTTP 429 |
| Integrity | Unique keys, FKs with chosen actions (RESTRICT / CASCADE / SET NULL), status-transition triggers, one-approved-claim guarantee, audit log |

**Known limitation:** `npm audit` reports an advisory in the copy of PostCSS that Next.js 15 bundles. It is used only at build time on our own stylesheet, so it can't be reached at runtime. Fixing it needs the Next.js 16 major upgrade.

## 15. Installation and running

**Prerequisites:**
- **Node.js 20.6+** (tested on 24)
- **MySQL 8.0+** running locally
- A **MongoDB** database: a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) M0 cluster, or a local `mongod` 6+

**Steps:**
```bash
git clone https://github.com/WellWeAreHere/findIt.git
cd findIt
npm install

cp .env.example .env.local      # then edit .env.local (see §16)

npm run db:setup                # creates + seeds MySQL and MongoDB, runs matching
npm run build
npm start                       # http://localhost:3000   (or: npm run dev)
```

For **MongoDB Atlas**:
1. Create an M0 cluster.
2. Under *Database Access*, add a database user.
3. Under *Network Access*, allow your IP (or `0.0.0.0/0` for development).
4. Copy the *Drivers → Node.js* connection string into `MONGODB_URI`.

**Seed accounts** (password `Password@123` for all):

| Role | Email |
|---|---|
| Admin | `meera.raghavan@university.edu` |
| Admin | `lostfound.desk@university.edu` |
| Student | `rahul.menon@university.edu` (owns lost bottle #1, pending claim on found bottle #2) |
| Student | `divya.krishnan@university.edu` (found bottle #2) |
| Student | any other `firstname.lastname@university.edu` from [`database/seed/data.js`](database/seed/data.js) |

`npm run db:setup` **resets** both databases to the seed state; use it before a demo. The walkthrough is in [docs/demo-script.md](docs/demo-script.md).

## 16. Environment variables

| Variable | Example | Purpose |
|---|---|---|
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | MySQL server |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `root` / … | MySQL credentials (needs CREATE DATABASE) |
| `MYSQL_DATABASE` | `findit` | Application database |
| `MYSQL_TEST_DATABASE` | `findit_test` | Rebuilt by the test suites |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority` | MongoDB connection |
| `MONGODB_DB` / `MONGODB_TEST_DB` | `findit` / `findit_test` | MongoDB databases |
| `JWT_SECRET` | 48+ random characters | Signs session tokens (at least 32 characters required) |
| `UPLOAD_DIR` | `./uploads` | Where uploaded images are stored |

## 17. Testing

| Command | What it runs |
|---|---|
| `npm run db:test` | **34 database tests**: constraints, triggers, generated columns, functions, views, procedures, index usage, transactions incl. **concurrent approvals**, MongoDB validators, text index and aggregations |
| `npm run build && npm run test:api` | **45 end-to-end API tests** against the real server: auth, RBAC, CSRF, rate limiting, validation, injection attempts, reports, matching, notifications, uploads, claims and the approval transaction, deletion across both databases, **simulated MongoDB outage and reconciliation**, admin operations |
| `npm test` | All of the above |

Both suites rebuild `findit_test` from the real scripts, so they never touch demo data. **Latest result: 79/79 passed.** The full table of test cases, manual UI checks and the defects found and fixed is in **[docs/test-cases.md](docs/test-cases.md)**.

## 18. Screenshots

| | |
|---|---|
| ![Browse](docs/screenshots/02-browse.png) Browse and search | ![Item with match](docs/screenshots/03-item-detail-with-match.png) Item page with explained match |
| ![Report form](docs/screenshots/04-report-form.png) Report form (fields from MongoDB template) | ![Dashboard](docs/screenshots/05-student-dashboard.png) Student dashboard |
| ![Admin analytics](docs/screenshots/07-admin-analytics.png) Admin analytics (each panel labelled MySQL or MongoDB) | ![Claim review](docs/screenshots/08-admin-claim-review.png) Claim review with competing claims |
| ![Match review](docs/screenshots/09-admin-match-review.png) Match review | ![Catalogue](docs/screenshots/10-admin-catalogue.png) Catalogue and template editor |

More, including phone-width views, are in [`docs/screenshots/`](docs/screenshots/).

## 19. Project structure
```
database/
  mysql/          01_schema … 07_sync_outbox (.sql)
  mongo/          init.js (collections, validators, indexes) · seed.js
  seed/           data.js (single source of seed data) · build-sql.js
  setup.js        builds both databases + runs matching
  tests/          db.test.js
docs/             01-design.md · er-diagram.mmd · api.md · queries.md · test-cases.md · demo-script.md · screenshots/
src/
  app/            pages (/, browse, items/[id], report/new, report/[id]/edit, dashboard, claims,
                  notifications, login, register, admin/*) and api/* route handlers
  components/     UI primitives, Navbar, ItemCard, MatchCard, ReportForm, ClaimPanel, admin/Charts …
  lib/
    db/           mysql.js (pool, transactions) · mongo.js
    repositories/ all SQL (users, reports, claims, matches, notifications, outbox, analytics, catalog)
                  mongo/ (itemDetails, templates, activity)
    services/     report · matching · claim · notification · sync · analytics · catalog · auth · user · upload
    matching/     scorer.js (weighted-v1)
    auth/         password · session · guards · roles
    validation/   schemas.js (zod)
    utils/        text.js (tokeniser shared by seed, search and matching)
  middleware.js · instrumentation.js
tests/            api.test.js
```
The API reference is in **[docs/api.md](docs/api.md)**.

## 20. Team contributions

> Fill this in honestly before submission. The brief (items 2, 15 and 16) asks for each member's individual contribution, and it should match your Git history.

| Member | SRN | Responsibilities |
|---|---|---|
| _Name_ | _SRN_ | _e.g. database design, triggers and procedures, claim transaction, admin dashboard_ |
| _Name_ | _SRN_ | _e.g. MongoDB design, matching engine, report and browse pages, testing and documentation_ |

## 21. Conclusion and future enhancements
FindIt shows how a relational database and a document database can each do what they are best at:
- **MySQL** guarantees the parts that must never be wrong: who owns what, which claim won, and what happened when. It does this through keys, constraints, triggers, procedures and transactions.
- **MongoDB** handles the parts that have no fixed shape: category-specific attributes, search and activity.
- A **transactional outbox** keeps them consistent without distributed transactions.
- An **explainable matching algorithm** connects lost and found reports automatically.

**Future enhancements:**
- **Semantic matching:** add an `embeddings-v2` scorer. Store description vectors in the reserved `embedding` field, using MongoDB Atlas Vector Search or pgvector, and compare with cosine similarity. The scorer interface and `algorithm_version` are already in place.
- Email or push notifications, and a reminder job for long-unclaimed items (the `REMINDER` type already exists).
- University single sign-on; QR-code tags on items handed to the desk.
- Image-based matching, such as colour histograms or vision embeddings.
- Automatic archiving of very old unresolved reports, and retention policies for the activity log (a MongoDB TTL index).
