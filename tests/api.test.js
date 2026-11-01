// End-to-end API tests. Rebuilds the TEST databases, starts the built
// Next.js server against them, and drives it over HTTP.
//   npm run build && npm run test:api
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { setupDatabases, mysqlConfig } from '../database/setup.js';

const MYSQL_DB = process.env.MYSQL_TEST_DATABASE ?? 'findit_test';
const MONGO_DB = process.env.MONGODB_TEST_DB ?? 'findit_test';
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PASSWORD = 'Password@123';

let server;
let db;
let mongo;
let items;

// Minimal client with a cookie jar, one per simulated user.
function client() {
  let cookie = '';
  return async function call(method, path, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  };
}

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/catalog`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Next.js server did not start (did you run `npm run build`?)');
}

before(async () => {
  await setupDatabases({ mysqlDatabase: MYSQL_DB, mongoDatabase: MONGO_DB, log: () => {} });
  db = await mysql.createConnection(mysqlConfig(MYSQL_DB));
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
  items = mongo.db(MONGO_DB).collection('item_details');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, MYSQL_DATABASE: MYSQL_DB, MONGODB_DB: MONGO_DB, NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[next] ${d}`));
  await waitForServer();
}, { timeout: 240_000 });

after(async () => {
  server?.kill();
  await db?.end();
  await mongo?.close();
});

const one = async (sql, params = []) => (await db.query(sql, params))[0][0];
const today = () => new Date().toISOString().slice(0, 10);

const anon = client();
const student = client();   // a newly registered student
const rahul = client();     // seed student s3 (owner of lost report 1)
const admin = client();
const finder = client();    // seed student s8 (found report 2)

let newUserId;
let myLostId;
let waterBottleItem;
let libraryReadingArea;

describe('public browsing', () => {
  test('catalog includes categories with characteristic templates', async () => {
    const { status, data } = await anon('GET', '/api/catalog');
    assert.equal(status, 200);
    assert.equal(data.categories.length, 10);
    const bottles = data.categories.find((c) => c.category_name === 'Bottles & Flasks');
    assert.ok(bottles.fields.some((f) => f.key === 'sticker'));
    waterBottleItem = bottles.items.find((i) => i.item_name === 'Water Bottle').item_id;
    libraryReadingArea = data.buildings.find((b) => b.building_name === 'Central Library')
      .locations.find((l) => l.area === 'Ground floor reading area').location_id;
  });

  test('browse with filters and pagination', async () => {
    const { data } = await anon('GET', '/api/reports?type=FOUND&status=OPEN&pageSize=5');
    assert.equal(data.items.length, 5);
    assert.ok(data.total > 5);
    assert.ok(data.items.every((r) => r.report_type === 'FOUND' && r.status === 'OPEN'));
    assert.ok(!('password_hash' in data.items[0]) && !('mongo_sync_status' in data.items[0]));
  });

  test('keyword search uses the text index', async () => {
    const { data } = await anon('GET', `/api/reports?q=${encodeURIComponent('black bottle red sticker')}`);
    assert.deepEqual(data.items.slice(0, 2).map((r) => r.report_id).sort(), [1, 2]);
  });

  test('SQL / NoSQL injection attempts are just text', async () => {
    const q = encodeURIComponent("'; DROP TABLE reports; --");
    assert.equal((await anon('GET', `/api/reports?q=${q}`)).status, 200);
    assert.equal((await anon('GET', '/api/reports?category=1%20OR%201=1')).status, 400);
    assert.equal((await one('SELECT COUNT(*) AS n FROM reports')).n, 72);
  });

  test('item detail hides matches and claims from strangers', async () => {
    const { status, data } = await anon('GET', '/api/reports/2');
    assert.equal(status, 200);
    assert.equal(data.details.characteristics.sticker, 'red sticker');
    assert.equal(data.matches, null);
    assert.equal(data.claims, null);
  });
});

describe('authentication', () => {
  test('register validates input on the server', async () => {
    const { status, data } = await anon('POST', '/api/auth/register', { name: 'X', email: 'bad', srn: '1', password: 'short' });
    assert.equal(status, 400);
    assert.ok(data.fields.email && data.fields.password && data.fields.name);
  });

  test('register logs the new student in', async () => {
    const { status, data } = await student('POST', '/api/auth/register', {
      name: 'Test Student', email: 'test.student@university.edu', srn: 'PES1UG23CS999', password: 'Secret1234',
    });
    assert.equal(status, 201);
    assert.equal(data.user.role, 'STUDENT');
    newUserId = data.user.user_id;
    const stored = await one('SELECT password_hash FROM users WHERE user_id = ?', [newUserId]);
    assert.match(stored.password_hash, /^\$2[aby]\$10\$/);
    assert.equal((await student('GET', '/api/auth/me')).data.user.email, 'test.student@university.edu');
  });

  test('duplicate email is rejected', async () => {
    const { status } = await anon('POST', '/api/auth/register', {
      name: 'Dup', email: 'test.student@university.edu', srn: 'PES1UG23CS998', password: 'Secret1234',
    });
    assert.equal(status, 409);
  });

  test('wrong password, then rate limiting', async () => {
    const attacker = client();
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await attacker('POST', '/api/auth/login', { email: 'kavya.nair@university.edu', password: 'wrong' })).status, 401);
    }
    assert.equal((await attacker('POST', '/api/auth/login', { email: 'kavya.nair@university.edu', password: 'wrong' })).status, 429);
  });

  test('seed users can log in', async () => {
    assert.equal((await rahul('POST', '/api/auth/login', { email: 'rahul.menon@university.edu', password: PASSWORD })).status, 200);
    assert.equal((await finder('POST', '/api/auth/login', { email: 'divya.krishnan@university.edu', password: PASSWORD })).status, 200);
    const res = await admin('POST', '/api/auth/login', { email: 'meera.raghavan@university.edu', password: PASSWORD });
    assert.equal(res.data.user.role, 'ADMIN');
  });
});

describe('role-based access', () => {
  test('anonymous users cannot write', async () => {
    assert.equal((await anon('POST', '/api/reports', {})).status, 401);
    assert.equal((await anon('GET', '/api/me/dashboard')).status, 401);
  });

  test('students cannot use admin endpoints', async () => {
    assert.equal((await student('GET', '/api/admin/stats')).status, 403);
    assert.equal((await student('POST', '/api/admin/claims/11/approve', {})).status, 403);
    assert.equal((await student('PATCH', `/api/admin/users/${newUserId}`, { role: 'ADMIN' })).status, 403);
  });

  test('admins cannot submit ownership claims', async () => {
    assert.equal((await admin('POST', '/api/claims', { report_id: 33, claim_description: 'Admins should not be able to claim items.' })).status, 403);
  });

  test('cross-site POSTs are blocked', async () => {
    const { status } = await student('POST', '/api/claims', {}, { origin: 'https://evil.example.com' });
    assert.equal(status, 403);
  });

  test('protected pages redirect to login', async () => {
    const res = await fetch(`${BASE}/dashboard`, { redirect: 'manual' });
    assert.equal(res.status, 307);
    assert.match(res.headers.get('location'), /\/login\?next=%2Fdashboard/);
  });
});

describe('reports and matching', () => {
  test('creating a lost report syncs to MongoDB and finds the matching found report', async () => {
    const { status, data } = await student('POST', '/api/reports', {
      report_type: 'LOST', item_id: waterBottleItem, location_id: libraryReadingArea, report_date: '2026-10-28',
      summary: 'Black Milton bottle with a red sticker',
      description: 'My black Milton steel water bottle with a red sticker. Lost it in the library reading area.',
      characteristics: { color: 'black', brand: 'Milton', material: 'steel', sticker: 'red sticker' },
    });
    assert.equal(status, 201);
    assert.equal(data.synced, true);
    assert.ok(data.matchesFound >= 1);
    myLostId = data.report_id;
    assert.equal((await one('SELECT mongo_sync_status FROM reports WHERE report_id = ?', [myLostId])).mongo_sync_status, 'SYNCED');
    assert.equal((await one('SELECT COUNT(*) AS n FROM mongo_outbox')).n, 0);
    const doc = await items.findOne({ report_id: myLostId });
    assert.equal(doc.characteristics.brand, 'Milton');
    assert.ok(doc.search_tags.includes('red sticker'));
  });

  test('the owner sees an explainable match', async () => {
    const { data } = await student('GET', `/api/reports/${myLostId}`);
    const best = data.matches[0];
    assert.equal(best.other_report_id, 2);
    assert.ok(best.match_score >= 60);
    const labels = best.matched_attributes.map((a) => a.label);
    assert.ok(labels.includes('Colour') && labels.includes('Same item type'));
  });

  test('both owners were notified of the strong match', async () => {
    const mine = await student('GET', '/api/notifications');
    assert.ok(mine.data.items.some((n) => n.notification_type === 'MATCH_FOUND' && n.related_report_id === myLostId));
    const theirs = await finder('GET', '/api/notifications');
    assert.ok(theirs.data.items.some((n) => n.notification_type === 'MATCH_FOUND' && n.related_report_id === 2));
  });

  test('server-side validation of reports', async () => {
    const base = { report_type: 'LOST', item_id: waterBottleItem, location_id: libraryReadingArea, summary: 'Something I lost', description: 'Longer description here' };
    const future = await student('POST', '/api/reports', { ...base, report_date: '2099-01-01' });
    assert.equal(future.status, 400);
    const badKey = await student('POST', '/api/reports', { ...base, report_date: today(), characteristics: { wattage: '65W' } });
    assert.equal(badKey.status, 400);
    assert.ok(badKey.data.fields['characteristics.wattage']);
    const badOption = await student('POST', '/api/reports', { ...base, report_date: today(), characteristics: { material: 'gold' } });
    assert.equal(badOption.status, 400);
    const custody = await student('POST', '/api/reports', { ...base, report_date: today(), custody_location_id: libraryReadingArea });
    assert.equal(custody.status, 400);
  });

  test('only the owner can edit; edits re-sync MongoDB', async () => {
    assert.equal((await rahul('PATCH', `/api/reports/${myLostId}`, { description: 'Hijacked description text' })).status, 403);
    const { status } = await student('PATCH', `/api/reports/${myLostId}`, {
      description: 'My black Milton steel bottle with a red guitar sticker near the cap.',
    });
    assert.equal(status, 200);
    assert.match((await items.findOne({ report_id: myLostId })).description, /guitar/);
  });

  test('dashboard uses the stored procedure and lists matches', async () => {
    const { data } = await student('GET', '/api/me/dashboard');
    assert.deepEqual(data.lost.map((r) => r.report_id), [myLostId]);
    assert.ok(data.lost[0].best_match_score >= 60);
    assert.ok(data.matches.some((m) => m.other_report_id === 2));
  });
});

describe('images', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5800000000049454e44ae426082', 'hex');

  test('valid PNG is stored and served', async () => {
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'photo.png');
    const { status, data } = await student('POST', `/api/reports/${myLostId}/images`, form);
    assert.equal(status, 201);
    assert.match(data.image.file, /^[a-f0-9]{32}\.png$/);
    const served = await anon('GET', `/api/uploads/${data.image.file}`);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  });

  test('a script renamed to .png is rejected', async () => {
    const form = new FormData();
    form.append('image', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
    assert.equal((await student('POST', `/api/reports/${myLostId}/images`, form)).status, 400);
  });

  test('path traversal in image names is refused', async () => {
    assert.equal((await anon('GET', '/api/uploads/..%2F..%2F.env.local')).status, 404);
  });

  test('others cannot add images to my report', async () => {
    const form = new FormData();
    form.append('image', new Blob([png]), 'x.png');
    assert.equal((await rahul('POST', `/api/reports/${myLostId}/images`, form)).status, 403);
  });
});

describe('claims', () => {
  let claimId;

  test('database rules reject invalid claims', async () => {
    const own = await finder('POST', '/api/claims', { report_id: 2, claim_description: 'I want to claim the bottle I found myself.' });
    assert.equal(own.status, 409);
    assert.match(own.data.error, /reported as found/);
    const lost = await student('POST', '/api/claims', { report_id: 1, claim_description: 'Trying to claim a lost report instead of a found one.' });
    assert.equal(lost.status, 409);
    const notMine = await student('POST', '/api/claims', { report_id: 2, lost_report_id: 1, claim_description: 'Linking somebody else lost report to my claim.' });
    assert.match(notMine.data.error, /own LOST reports/);
  });

  test('student claims the found bottle, linking their lost report', async () => {
    const { status, data } = await student('POST', '/api/claims', {
      report_id: 2, lost_report_id: myLostId, claim_description: 'It is my Milton bottle, the red sticker is a guitar and there is a dent on the base.',
    });
    assert.equal(status, 201);
    claimId = data.claim_id;
    assert.equal((await student('POST', '/api/claims', { report_id: 2, claim_description: 'Claiming the same item twice should fail.' })).status, 409);
  });

  test('admin queue shows competing claims', async () => {
    const { data } = await admin('GET', '/api/admin/claims');
    const forBottle = data.pending.filter((c) => c.report_id === 2);
    assert.equal(forBottle.length, 2); // seed claim by Rahul + this one
    assert.ok(forBottle.every((c) => c.competing_claims === 2));
  });

  test('approval is atomic: claim, both reports, competitors and notifications', async () => {
    const { status, data } = await admin('POST', `/api/admin/claims/${claimId}/approve`, { note: 'Dent on base verified' });
    assert.equal(status, 200);
    assert.equal(data.claim.status, 'APPROVED');
    const statuses = await db.query('SELECT report_id, status FROM reports WHERE report_id IN (2, ?)', [myLostId]);
    assert.ok(statuses[0].every((r) => r.status === 'RESOLVED'));
    assert.equal((await one('SELECT status FROM claims WHERE claim_id = 12')).status, 'REJECTED');
    assert.equal((await one('SELECT match_status FROM matches WHERE lost_report_id = ? AND found_report_id = 2', [myLostId])).match_status, 'CONFIRMED');
    const inbox = await student('GET', '/api/notifications');
    assert.ok(inbox.data.items.some((n) => n.notification_type === 'CLAIM_APPROVED'));
    const rahulInbox = await rahul('GET', '/api/notifications');
    assert.ok(rahulInbox.data.items.some((n) => n.notification_type === 'CLAIM_REJECTED'));
  });

  test('a decided claim cannot be approved again or withdrawn', async () => {
    assert.equal((await admin('POST', `/api/admin/claims/${claimId}/approve`, {})).status, 409);
    assert.equal((await student('POST', `/api/claims/${claimId}/withdraw`)).status, 409);
  });

  test('a resolved report cannot be edited', async () => {
    assert.equal((await student('PATCH', `/api/reports/${myLostId}`, { summary: 'Trying to edit after resolution' })).status, 409);
  });

  test('withdrawing a pending claim', async () => {
    const pending = await one("SELECT claim_id FROM claims WHERE status = 'PENDING' AND claimant_id = (SELECT user_id FROM users WHERE email = 'arjun.nair@university.edu')");
    const arjun = client();
    await arjun('POST', '/api/auth/login', { email: 'arjun.nair@university.edu', password: PASSWORD });
    assert.equal((await rahul('POST', `/api/claims/${pending.claim_id}/withdraw`)).status, 404);
    assert.equal((await arjun('POST', `/api/claims/${pending.claim_id}/withdraw`)).status, 200);
  });
});

describe('close, delete and consistency', () => {
  test('reports that are part of a claim cannot be deleted', async () => {
    assert.equal((await finder('DELETE', '/api/reports/2')).status, 409);
    assert.equal((await rahul('DELETE', '/api/reports/1')).status, 409);
    assert.equal((await rahul('DELETE', '/api/reports/33')).status, 403);
  });

  test('owners can close an open report', async () => {
    const tejas = client();
    await tejas('POST', '/api/auth/login', { email: 'tejas.murthy@university.edu', password: PASSWORD });
    assert.equal((await tejas('POST', '/api/reports/70/close')).status, 200);
    assert.equal((await one('SELECT status FROM reports WHERE report_id = 70')).status, 'CLOSED');
    assert.equal((await tejas('POST', '/api/reports/70/close')).status, 409);
  });

  test('deleting a claim-free report removes both the row and the document', async () => {
    const { data } = await student('POST', '/api/reports', {
      report_type: 'FOUND', item_id: waterBottleItem, location_id: libraryReadingArea, report_date: today(),
      summary: 'Test bottle to be deleted', description: 'Created only to test deletion across both databases.',
    });
    const id = data.report_id;
    assert.ok(await items.findOne({ report_id: id }));
    assert.equal((await student('DELETE', `/api/reports/${id}`)).status, 200);
    assert.equal(await one('SELECT report_id FROM reports WHERE report_id = ?', [id]), undefined);
    assert.equal(await items.findOne({ report_id: id }), null);
  });

  test('reconciler delivers outbox entries left behind by a MongoDB outage', async () => {
    // Simulate: MySQL committed the report + outbox entry, MongoDB write failed.
    await db.query('SET @app_user_id = NULL');
    const [res] = await db.query(
      "INSERT INTO reports (user_id, item_id, location_id, report_type, description, report_date, mongo_sync_status, sync_attempts) VALUES (?, ?, ?, 'FOUND', 'Bottle reported during a MongoDB outage', CURDATE(), 'FAILED', 1)",
      [newUserId, waterBottleItem, libraryReadingArea],
    );
    const id = res.insertId;
    const payload = {
      report_id: id, report_type: 'FOUND', item_name: 'Water Bottle', category_id: 2, category_name: 'Bottles & Flasks',
      building_name: 'Central Library', report_date: today(), description: 'Saved in the outbox while MongoDB was down.',
      characteristics: { color: 'blue' }, search_tags: ['water bottle', 'blue'], tokens: ['water', 'bottle', 'blue'],
      embedding: null, schema_version: 1, created_at: new Date().toISOString(),
    };
    await db.query("INSERT INTO mongo_outbox (report_id, operation, payload, attempts) VALUES (?, 'UPSERT', ?, 1)", [id, JSON.stringify(payload)]);
    // ...and an orphan document whose MySQL row no longer exists.
    await items.insertOne({ ...payload, report_id: 99999, report_date: new Date(), created_at: new Date(), images: [] });

    const { data } = await admin('POST', '/api/admin/sync');
    assert.ok(data.synced >= 1);
    assert.ok(data.orphansRemoved >= 1);
    assert.equal((await items.findOne({ report_id: id })).description, 'Saved in the outbox while MongoDB was down.');
    assert.equal((await one('SELECT mongo_sync_status FROM reports WHERE report_id = ?', [id])).mongo_sync_status, 'SYNCED');
    assert.equal(await items.findOne({ report_id: 99999 }), null);
    assert.equal((await one('SELECT COUNT(*) AS n FROM mongo_outbox')).n, 0);
  });
});

describe('admin operations', () => {
  test('analytics combine MySQL and MongoDB', async () => {
    const { status, data } = await admin('GET', '/api/admin/stats');
    assert.equal(status, 200);
    assert.ok(data.totals.total_reports >= 72);
    assert.ok(data.totals.recoveries >= 10);
    assert.ok(data.hotspots.every((h) => h.total_reports >= 2));
    assert.equal(data.mongo.colours[0].value, 'black');
    assert.ok(data.mongo.monthly.length >= 3);
    assert.ok(data.auditTrail.length > 0);
  });

  test('recovery summary procedure via ?from&to', async () => {
    const { data } = await admin('GET', '/api/admin/stats?from=2026-08-01&to=2026-10-31');
    assert.ok(data.overall.total_reports >= 72);
    assert.ok(data.byCategory.length > 0);
  });

  test('match review', async () => {
    const { data } = await admin('GET', '/api/admin/matches?status=SUGGESTED&minScore=40');
    const m = data.items[data.items.length - 1];
    const res = await admin('PATCH', `/api/admin/matches/${m.match_id}`, { match_status: 'DISMISSED' });
    assert.equal(res.data.match.match_status, 'DISMISSED');
    const confirmed = (await admin('GET', '/api/admin/matches?status=CONFIRMED')).data.items[0];
    assert.equal((await admin('PATCH', `/api/admin/matches/${confirmed.match_id}`, { match_status: 'DISMISSED' })).status, 400);
  });

  test('deactivating a user locks them out immediately', async () => {
    assert.equal((await admin('PATCH', `/api/admin/users/${newUserId}`, { is_active: false })).status, 200);
    assert.equal((await student('GET', '/api/me/dashboard')).status, 401);
    await admin('PATCH', `/api/admin/users/${newUserId}`, { is_active: true });
    assert.equal((await student('GET', '/api/me/dashboard')).status, 200);
  });

  test('admins cannot demote themselves', async () => {
    assert.equal((await admin('PATCH', '/api/admin/users/1', { role: 'STUDENT' })).status, 400);
  });

  test('catalogue: a location in use cannot be deleted; a new one can', async () => {
    assert.equal((await admin('DELETE', `/api/admin/locations/${libraryReadingArea}`)).status, 409);
    const created = await admin('POST', '/api/admin/locations', { building_id: 1, floor: 4, area: 'Rooftop study deck' });
    assert.equal(created.status, 201);
    assert.equal((await admin('POST', '/api/admin/locations', { building_id: 1, floor: 4, area: 'Rooftop study deck' })).status, 409);
    assert.equal((await admin('DELETE', `/api/admin/locations/${created.data.id}`)).status, 200);
  });

  test('templates are validated and saved to MongoDB', async () => {
    assert.equal((await admin('PUT', '/api/admin/templates/4', { fields: [{ key: 'Bad Key', label: 'x', type: 'text', match_weight: 1 }] })).status, 400);
    const cat = (await anon('GET', '/api/catalog')).data.categories.find((c) => c.category_id === 4);
    const fields = [...cat.fields, { key: 'ring_type', label: 'Key ring type', type: 'text', match_weight: 1 }];
    assert.equal((await admin('PUT', '/api/admin/templates/4', { fields })).status, 200);
    const after = (await anon('GET', '/api/catalog')).data.categories.find((c) => c.category_id === 4);
    assert.ok(after.fields.some((f) => f.key === 'ring_type'));
  });
});

describe('notifications', () => {
  test('mark all read and delete', async () => {
    const before = await student('GET', '/api/notifications');
    assert.ok(before.data.unread > 0);
    const res = await student('PATCH', '/api/notifications', { all: true });
    assert.equal(res.data.unread, 0);
    const first = before.data.items[0].notification_id;
    assert.equal((await student('DELETE', `/api/notifications/${first}`)).status, 200);
    assert.equal((await rahul('DELETE', `/api/notifications/${first}`)).status, 404);
  });

  test('logout clears the session', async () => {
    await student('POST', '/api/auth/logout');
    assert.equal((await student('GET', '/api/auth/me')).data.user, null);
  });
});
