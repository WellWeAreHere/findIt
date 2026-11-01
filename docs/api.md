# FindIt — API Reference

Base URL: `http://localhost:3000`. All bodies are JSON unless noted.

**Authentication.** A signed session cookie (`findit_session`: httpOnly, SameSite=Lax, 7 days) is set by `/api/auth/login` and `/api/auth/register`. Every protected endpoint re-reads the user's role and active flag from MySQL on each request.

**Errors** always look like this:
```json
{ "error": "Human-readable message", "fields": { "field": "Per-field message" } }
```

| Status | Meaning |
|---|---|
| 400 | Validation failed (`fields` explains which inputs) |
| 401 | Not logged in |
| 403 | Logged in, but not allowed |
| 404 | Not found, or not yours |
| 409 | Conflict: a database rule refused the change (duplicate, trigger SIGNAL, not open, in use) |
| 429 | Too many login attempts |
| 500 | Unexpected error (details are logged on the server, never sent) |

**CSRF.** Requests that change data (POST/PATCH/PUT/DELETE) are refused with 403 when an `Origin` header from another site is present.

Legend: 🌐 public · 👤 any logged-in user · 🎓 students only · 🛡️ admins only

---

## Auth

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/register` | 🌐 | `{ name, email, srn, password }`: password needs 8+ characters with a letter and a digit | `201 { user }` + cookie |
| POST | `/api/auth/login` | 🌐 | `{ email, password }` | `{ user }` + cookie. Returns 429 after 5 failures in 15 minutes. |
| POST | `/api/auth/logout` | 🌐 | – | `{ ok }`, cookie cleared |
| GET | `/api/auth/me` | 🌐 | – | `{ user }` or `{ user: null }` |

## Catalogue

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | `/api/catalog` | 🌐 | `{ categories: [{ category_id, category_name, items[], fields[] }], buildings: [{ building_id, building_name, zone, locations[] }] }`. `fields` is the MongoDB characteristic template that drives the report form. |

## Reports

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/reports` | 🌐 | Browse and search. Query parameters (see below). |
| GET | `/api/reports/recent` | 🌐 | 8 newest open reports, for the landing page |
| POST | `/api/reports` | 👤 | Create a report (body below). Returns `201 { report_id, synced, matchesFound }`. |
| GET | `/api/reports/:id` | 🌐 | Detail (see below) |
| PATCH | `/api/reports/:id` | 👤 owner | Any subset of the create fields except `report_type`. Only OPEN reports can be edited; the change is re-synced and re-matched. |
| DELETE | `/api/reports/:id` | 👤 owner / 🛡️ | Only if no claim references it, otherwise 409 (close it instead) |
| POST | `/api/reports/:id/close` | 👤 owner / 🛡️ | OPEN → CLOSED |
| POST | `/api/reports/:id/images` | 👤 owner | `multipart/form-data` with field `image`: JPEG/PNG/WebP (checked by file signature), at most 5 MB, at most 3 per report |
| DELETE | `/api/reports/:id/images/:file` | 👤 owner / 🛡️ | |
| GET | `/api/uploads/:file` | 🌐 | Serves an uploaded image with `nosniff` and a CSP header |

**Browse query parameters:**
- `q`: keyword search via the MongoDB text index
- `type`: `LOST` or `FOUND`
- `status`: `OPEN`, `RESOLVED` or `CLOSED`
- `category`, `building`, `location`: IDs
- `from`, `to`: dates as `YYYY-MM-DD`
- `sort`: `newest`, `oldest` or `relevance`
- `page`, `pageSize`: `pageSize` is at most 50

It returns `{ items, total, page, pageSize }`. Each item is a `v_report_card` row plus `characteristics` and `thumbnail`.

**Create body:**
```json
{
  "report_type": "LOST",
  "item_id": 9,
  "location_id": 13,
  "custody_location_id": null,
  "report_date": "2026-10-28",
  "summary": "Black Milton bottle with a red sticker",
  "description": "Longer free-text description…",
  "characteristics": { "color": "black", "brand": "Milton", "sticker": "red sticker" }
}
```
`characteristics` keys must exist in the category's template. Select fields must use one of the template's options. `custody_location_id` is only allowed for FOUND reports. Dates can't be in the future; this is also enforced by a trigger.

**Detail response:**

| Field | Contents |
|---|---|
| `report` | The report card from MySQL |
| `details` | `description`, `characteristics`, `search_tags`, `images` (from MongoDB) |
| `detailsSyncing` | True if the MongoDB document doesn't exist yet |
| `activity` | Recent events from MongoDB `report_activity` |
| `isOwner` | Whether the viewer owns the report |
| `matches`, `claims` | Only for the owner or an admin, otherwise `null`. Each match has `match_score`, the five component scores, and `matched_attributes`, e.g. `[{kind:'attribute', label:'Colour', value:'black'}, {kind:'location', label:'Same building'}]`. |
| `claimContext` | For a logged-in student viewing someone else's OPEN FOUND report: `canClaim`, `existingClaim`, `myOpenLostReports` |

## Student area

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | `/api/me/dashboard` | 👤 | `{ lost, found, matches, claims, incomingClaims, notifications }`. `lost`/`found` come from `CALL sp_reports_by_user`. |
| GET | `/api/me/reports?type=&status=` | 👤 | The user's reports |
| GET | `/api/notifications?unread=true` | 👤 | `{ items, unread }` |
| PATCH | `/api/notifications` | 👤 | `{ ids: [..] }` or `{ all: true }`, returns `{ updated, unread }` |
| DELETE | `/api/notifications/:id` | 👤 | 404 if it isn't yours |

## Claims

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/claims` | 👤 | `{ mine, incoming }`: claims you made, and claims on items you found |
| POST | `/api/claims` | 🎓 | `{ report_id, lost_report_id?, claim_description }`. The trigger `trg_claims_bi` refuses claims on LOST or non-open reports, claims on your own found report, and links to someone else's lost report (409 with the reason). A second claim on the same item returns 409. The finder is notified. |
| POST | `/api/claims/:id/withdraw` | 🎓 claimant | PENDING → WITHDRAWN |

## Admin 🛡️

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/claims` | `{ pending (v_pending_claims), decided }` |
| POST | `/api/admin/claims/:id/approve` | `{ note? }` → `CALL sp_approve_claim`. In one locked transaction it approves the claim, rejects competing claims, resolves the found report and the linked lost report, confirms the match, and notifies everyone. |
| POST | `/api/admin/claims/:id/reject` | `{ note? }` → `CALL sp_reject_claim` |
| GET | `/api/admin/matches?status=&minScore=` | Matches with both sides' cards |
| POST | `/api/admin/matches` | Re-run matching for every open report |
| PATCH | `/api/admin/matches/:id` | `{ match_status: CONFIRMED / DISMISSED / SUGGESTED }`. A confirmed match is final. |
| GET | `/api/admin/stats` | Dashboard data. MySQL provides totals, `v_recovery_stats`, hotspots (GROUP BY/HAVING), `v_unresolved_reports`, unmatched lost (NOT EXISTS), the audit trail and sync health. MongoDB provides the monthly trend, lost-by-category, colours, brands, tags and activity. |
| GET | `/api/admin/stats?from=&to=` | `CALL sp_recovery_summary`, returning `{ overall, byCategory, byBuilding }` |
| GET | `/api/admin/users?search=` | Users with report and claim counts |
| PATCH | `/api/admin/users/:id` | `{ is_active?, role? }`. You can't deactivate or demote yourself. |
| POST | `/api/admin/buildings` | `{ building_name, zone }` |
| POST | `/api/admin/locations` | `{ building_id, floor, area }` |
| DELETE | `/api/admin/locations/:id` | 409 if any report uses it |
| POST | `/api/admin/categories` | `{ category_name, description? }` |
| POST | `/api/admin/items` | `{ category_id, item_name }` |
| DELETE | `/api/admin/items/:id` | 409 if in use |
| PUT | `/api/admin/templates/:categoryId` | `{ fields: [{ key, label, type: text/select/number, options?, match_weight 0-5, required? }] }` (MongoDB) |
| GET | `/api/admin/sync` | Outbox queue and unsynced reports |
| POST | `/api/admin/sync` | Run the reconciler now, returning `{ retried, synced, stillFailing, orphansRemoved, missingDetails }` |
