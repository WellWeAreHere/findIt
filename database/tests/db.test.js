// Database-level tests for FindIt (MySQL + MongoDB), run with:
//   npm run db:test
// Rebuilds MYSQL_TEST_DATABASE / MONGODB_TEST_DB from the real setup
// scripts, then exercises constraints, triggers, procedures, views,
// transactions and MongoDB indexes/validators against them.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { setupDatabases, mysqlConfig } from '../setup.js';

const MYSQL_DB = process.env.MYSQL_TEST_DATABASE ?? 'findit_test';
const MONGO_DB = process.env.MONGODB_TEST_DB ?? 'findit_test';
const ADMIN = 1;
const s = (n) => n + 2; // seed student s<n> -> user_id

let pool;
let mongo;
let mdb;

before(async () => {
  await setupDatabases({ mysqlDatabase: MYSQL_DB, mongoDatabase: MONGO_DB, log: () => {} });
  pool = mysql.createPool({ ...mysqlConfig(MYSQL_DB), connectionLimit: 4 });
  mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  mdb = mongo.db(MONGO_DB);
}, { timeout: 180_000 });

after(async () => {
  await pool?.end();
  await mongo?.close();
});

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const scalar = async (sql, params = []) => Object.values(await one(sql, params))[0];

async function rejects(sql, params, pattern) {
  await assert.rejects(pool.query(sql, params), (err) => {
    assert.match(`${err.code} ${err.message}`, pattern);
    return true;
  });
}

// Runs fn inside a transaction that is always rolled back.
async function inRollback(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await fn(conn);
  } finally {
    await conn.rollback();
    conn.release();
  }
}

const locId = (area) => scalar('SELECT location_id FROM locations WHERE area = ?', [area]);
const itemId = (name) => scalar('SELECT item_id FROM items WHERE item_name = ?', [name]);

describe('schema and seed', () => {
  test('seed row counts', async () => {
    assert.equal(await scalar('SELECT COUNT(*) FROM users'), 25);
    assert.equal(await scalar('SELECT COUNT(*) FROM categories'), 10);
    assert.equal(await scalar('SELECT COUNT(*) FROM reports'), 72);
    assert.equal(await scalar('SELECT COUNT(*) FROM claims'), 16);
  });

  test('seeded claim decisions went through the procedures', async () => {
    const rows = (await pool.query('SELECT status, COUNT(*) n FROM claims GROUP BY status ORDER BY status'))[0];
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.status, r.n])),
      { PENDING: 5, APPROVED: 9, REJECTED: 1, WITHDRAWN: 1 });
    assert.equal(await scalar("SELECT COUNT(*) FROM reports WHERE status = 'RESOLVED'"), 18);
    assert.equal(await scalar("SELECT COUNT(*) FROM reports WHERE status = 'CLOSED'"), 2);
  });

  test('migration added the phone column and its CHECK', async () => {
    assert.equal(await scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users' AND column_name = 'phone'", [MYSQL_DB]), 1);
    await rejects("UPDATE users SET phone = 'abc' WHERE user_id = 3", [], /chk_users_phone/);
    await inRollback((c) => c.query("UPDATE users SET phone = '+919876543210' WHERE user_id = 3"));
  });
});

describe('constraints', () => {
  test('email must be unique and well-formed', async () => {
    const hash = await scalar('SELECT password_hash FROM users WHERE user_id = 1');
    await rejects("INSERT INTO users (name, email, srn, password_hash) VALUES ('Test User', 'not-an-email', 'X1', ?)", [hash], /chk_users_email/);
    await rejects("INSERT INTO users (name, email, srn, password_hash) VALUES ('Test User', 'aditya.rao@university.edu', 'X2', ?)", [hash], /ER_DUP_ENTRY/);
  });

  test('students must have an SRN and passwords must be bcrypt hashes', async () => {
    const hash = await scalar('SELECT password_hash FROM users WHERE user_id = 1');
    await rejects("INSERT INTO users (name, email, password_hash) VALUES ('No Srn', 'nosrn@university.edu', ?)", [hash], /chk_users_student_srn/);
    await rejects("INSERT INTO users (name, email, srn, password_hash) VALUES ('Plain', 'plain@university.edu', 'X3', 'password123')", [], /chk_users_hash/);
  });

  test('custody location is only allowed on FOUND reports', async () => {
    const [item, loc] = [await itemId('Laptop'), await locId('Computer Lab 3')];
    await rejects(
      "INSERT INTO reports (user_id, item_id, location_id, custody_location_id, report_type, description, report_date) VALUES (3, ?, ?, ?, 'LOST', 'A lost laptop for testing', '2026-10-01')",
      [item, loc, loc], /chk_reports_custody/);
  });

  test('summary must be meaningful', async () => {
    await rejects(
      "INSERT INTO reports (user_id, item_id, location_id, report_type, description, report_date) VALUES (3, 1, 1, 'LOST', 'short', '2026-10-01')",
      [], /chk_reports_description/);
  });

  test('match scores must be in [0,1]', async () => {
    await rejects(
      'INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score, category_score, location_score, date_score) VALUES (52, 53, 1.5, 1, 1, 1, 1)',
      [], /chk_matches_desc|Out of range/);
  });
});

describe('triggers', () => {
  test('report date cannot be in the future', async () => {
    await rejects(
      "INSERT INTO reports (user_id, item_id, location_id, report_type, description, report_date) VALUES (3, 1, 1, 'LOST', 'A report from tomorrow', CURDATE() + INTERVAL 1 DAY)",
      [], /cannot be in the future/);
  });

  test('a resolved report cannot be reopened, report type cannot change', async () => {
    await rejects("UPDATE reports SET status = 'OPEN' WHERE report_id = 4", [], /cannot be reopened/);
    await rejects("UPDATE reports SET report_type = 'LOST' WHERE report_id = 33", [], /cannot be changed/);
  });

  test('claims are only allowed on open FOUND reports by other students', async () => {
    const text = 'This is definitely my item, I can describe it in detail.';
    await rejects('INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (45, ?, ?)', [s(5), text], /only be made on FOUND/);
    await rejects('INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (4, ?, ?)', [s(1), text], /no longer open/);
    await rejects('INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (33, ?, ?)', [s(10), text], /reported as found/);
    await rejects('INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (33, ?, ?)', [ADMIN, text], /Only active students/);
    await rejects('INSERT INTO claims (report_id, claimant_id, lost_report_id, claim_description) VALUES (33, ?, 34, ?)', [s(1), text], /own LOST reports/);
    await rejects('INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (8, ?, ?)', [s(9), text], /ER_DUP_ENTRY/);
  });

  test('a decided claim cannot change status', async () => {
    await rejects("UPDATE claims SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL WHERE claim_id = 1", [], /cannot change status/);
  });

  test('matches must pair LOST with FOUND from different users', async () => {
    const scores = '0.5, 0.5, 0.5, 0.5, 0.5';
    const sql = (l, f) => `INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score, category_score, location_score, date_score) VALUES (${l}, ${f}, ${scores})`;
    await rejects(sql(45, 45), [], /matched with itself/);
    await rejects(sql(45, 47), [], /must pair a LOST report with a FOUND/);
    await rejects(sql(53, 52), [], /must pair a LOST report with a FOUND/);
  });

  test('every report creation and status change is audited', async () => {
    assert.equal(await scalar("SELECT COUNT(*) FROM status_audit_log WHERE entity_type = 'REPORT' AND old_status IS NULL"), 72);
    const audit = await one("SELECT old_status, new_status, changed_by FROM status_audit_log WHERE entity_type = 'CLAIM' AND entity_id = 1 AND new_status = 'APPROVED'");
    assert.deepEqual({ ...audit }, { old_status: 'PENDING', new_status: 'APPROVED', changed_by: ADMIN });
    const closed = await one("SELECT changed_by FROM status_audit_log WHERE entity_type = 'REPORT' AND entity_id = 51 AND new_status = 'CLOSED'");
    assert.equal(closed.changed_by, s(9));
  });
});

describe('generated columns', () => {
  test('match_score is derived from the weighted components; pairs are unique', async () => {
    await inRollback(async (c) => {
      await c.query('SET @app_user_id = 1');
      await c.query('DELETE FROM matches WHERE lost_report_id = 52 AND found_report_id = 53'); // computed at setup
      await c.query('INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score, category_score, location_score, date_score, matched_attributes) VALUES (52, 53, 0.5, 1, 1, 0.3, 0.857, JSON_ARRAY(\'brand: oneplus\'))');
      const [[m]] = await c.query('SELECT match_id, match_score FROM matches WHERE lost_report_id = 52 AND found_report_id = 53');
      assert.equal(m.match_score, '70.57');
      await assert.rejects(
        c.query('INSERT INTO matches (lost_report_id, found_report_id, description_score, characteristics_score, category_score, location_score, date_score) VALUES (52, 53, 0, 0, 0, 0, 0)'),
        /Duplicate entry/);
      await c.query("UPDATE matches SET match_status = 'DISMISSED' WHERE match_id = ?", [m.match_id]);
      const [[a]] = await c.query("SELECT new_status, changed_by FROM status_audit_log WHERE entity_type = 'MATCH' AND entity_id = ?", [m.match_id]);
      assert.deepEqual({ ...a }, { new_status: 'DISMISSED', changed_by: 1 });
    });
  });

  test('at most one APPROVED claim per report, even bypassing the procedure', async () => {
    await inRollback(async (c) => {
      await c.query("INSERT INTO claims (report_id, claimant_id, claim_description) VALUES (8, ?, 'Second claimant for the same key bunch, for testing.')", [s(1)]);
      await c.query("UPDATE claims SET status = 'APPROVED', reviewed_by = 1, reviewed_at = NOW() WHERE claim_id = 11");
      await assert.rejects(
        c.query("UPDATE claims SET status = 'APPROVED', reviewed_by = 1, reviewed_at = NOW() WHERE report_id = 8 AND claim_id <> 11"),
        /Duplicate entry .*uq_claims_one_approved/);
    });
  });
});

describe('functions, views and procedures', () => {
  test('fn_location_proximity grades the campus hierarchy', async () => {
    const [read, entrance, stacks, lobby, food] = await Promise.all(
      ['Ground floor reading area', 'Main entrance and bag counter', 'Reference stacks', 'Ground floor lobby', 'Seating area'].map(locId));
    const prox = (a, b) => scalar('SELECT fn_location_proximity(?, ?)', [a, b]);
    assert.equal(await prox(read, read), '1.000');
    assert.equal(await prox(read, entrance), '0.800');
    assert.equal(await prox(read, stacks), '0.600');
    assert.equal(await prox(read, lobby), '0.300');
    assert.equal(await prox(read, food), '0.000');
  });

  test('fn_date_proximity and fn_category_similarity', async () => {
    assert.equal(await scalar("SELECT fn_date_proximity('2026-10-28', '2026-10-29')"), '0.929');
    assert.equal(await scalar("SELECT fn_date_proximity('2026-10-28', '2026-10-25')"), '0.000');
    const [laptop, phone, wallet] = await Promise.all(['Laptop', 'Phone', 'Wallet'].map(itemId));
    assert.equal(await scalar('SELECT fn_category_similarity(?, ?)', [laptop, laptop]), '1.000');
    assert.equal(await scalar('SELECT fn_category_similarity(?, ?)', [laptop, phone]), '0.600');
    assert.equal(await scalar('SELECT fn_category_similarity(?, ?)', [laptop, wallet]), '0.000');
  });

  test('views', async () => {
    const card = await one('SELECT * FROM v_report_card WHERE report_id = 2');
    assert.equal(card.building_name, 'Central Library');
    assert.equal(card.custody_location, 'Administrative Block - Security office (Lost & Found desk)');
    assert.ok(!('password_hash' in card));
    assert.equal(await scalar('SELECT COUNT(*) FROM v_report_card'), 72);
    assert.equal(await scalar("SELECT COUNT(*) FROM v_unresolved_reports"), await scalar("SELECT COUNT(*) FROM reports WHERE status = 'OPEN'"));
    assert.equal(await scalar("SELECT COUNT(*) FROM v_active_lost_reports WHERE report_type <> 'LOST' OR status <> 'OPEN'"), 0);
    assert.equal(await scalar('SELECT SUM(recoveries) FROM v_recovery_stats'), '9');
    const queue = await one('SELECT competing_claims FROM v_pending_claims WHERE report_id = 28 LIMIT 1');
    assert.equal(queue.competing_claims, 2);
  });

  test('sp_recovery_summary returns totals, categories (HAVING) and buildings', async () => {
    const [results] = await pool.query("CALL sp_recovery_summary('2026-08-01', '2026-10-31')");
    const [totals, byCategory, byBuilding] = results;
    assert.equal(totals[0].total_reports, 72);
    assert.equal(totals[0].items_returned, '9');
    assert.ok(byCategory.every((r) => r.total_reports >= 2));
    assert.ok(byBuilding.length > 5);
  });

  test('sp_reports_by_user and sp_reports_by_category', async () => {
    const [[mine]] = await pool.query('CALL sp_reports_by_user(?, NULL)', [s(3)]);
    assert.deepEqual(mine.map((r) => r.report_id).sort((a, b) => a - b), [1, 20, 49]);
    const [[lostOnly]] = await pool.query("CALL sp_reports_by_user(?, 'LOST')", [s(3)]);
    assert.ok(lostOnly.every((r) => r.report_type === 'LOST'));
    const [[electronics]] = await pool.query("CALL sp_reports_by_category(1, 'OPEN')");
    assert.ok(electronics.length > 0 && electronics.every((r) => r.category_name === 'Electronics' && r.status === 'OPEN'));
  });

  test('indexes are used by the browse query', async () => {
    const [plan] = await pool.query("EXPLAIN FORMAT=JSON SELECT report_id FROM reports WHERE report_type = 'FOUND' AND status = 'OPEN' AND report_date >= '2026-10-01'");
    assert.match(JSON.stringify(plan), /idx_reports_browse/);
  });
});

describe('claim approval transaction', () => {
  test('only an admin can approve', async () => {
    await rejects('CALL sp_approve_claim(11, ?, NULL)', [s(3)], /Only an active administrator/);
    assert.equal(await scalar('SELECT status FROM claims WHERE claim_id = 11'), 'PENDING');
  });

  test('only pending claims can be approved', async () => {
    await rejects('CALL sp_approve_claim(1, 1, NULL)', [], /Only pending claims/);
  });

  test('approval resolves both reports and notifies everyone atomically', async () => {
    const before = await scalar('SELECT COUNT(*) FROM notifications');
    await pool.query("CALL sp_approve_claim(12, 1, 'Dent and sticker verified')");
    const reports = (await pool.query('SELECT report_id, status FROM reports WHERE report_id IN (1, 2) ORDER BY report_id'))[0];
    assert.deepEqual(reports.map((r) => r.status), ['RESOLVED', 'RESOLVED']);
    assert.equal(await scalar('SELECT COUNT(*) FROM notifications'), before + 2);
    assert.equal(await scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND notification_type = 'CLAIM_APPROVED' AND related_report_id = 2", [s(3)]), 1);
  });

  test('two admins approving competing claims at once: exactly one wins', async () => {
    const [a, b] = await Promise.all([pool.getConnection(), pool.getConnection()]);
    try {
      const results = await Promise.allSettled([
        a.query("CALL sp_approve_claim(13, 1, 'Keychain verified')"),
        b.query("CALL sp_approve_claim(14, 2, 'Lab coat verified')"),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.match(results.find((r) => r.status === 'rejected').reason.message, /no longer open|Only pending claims/);
    } finally {
      a.release();
      b.release();
    }
    const rows = (await pool.query('SELECT status FROM claims WHERE report_id = 28 ORDER BY status'))[0];
    assert.deepEqual(rows.map((r) => r.status), ['APPROVED', 'REJECTED']);
    assert.equal(await scalar('SELECT status FROM reports WHERE report_id = 28'), 'RESOLVED');
  });

  test('rejection notifies the claimant', async () => {
    await pool.query("CALL sp_reject_claim(15, 1, 'Lock screen photo did not match')");
    assert.equal(await scalar('SELECT status FROM claims WHERE claim_id = 15'), 'REJECTED');
    assert.equal(await scalar("SELECT status FROM reports WHERE report_id = 24"), 'OPEN');
    assert.equal(await scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND notification_type = 'CLAIM_REJECTED'", [s(23)]), 1);
  });
});

describe('MongoDB', () => {
  test('every MySQL report has exactly one item_details document and is SYNCED', async () => {
    const ids = (await pool.query('SELECT report_id FROM reports ORDER BY report_id'))[0].map((r) => r.report_id);
    const docs = await mdb.collection('item_details').find({}, { projection: { report_id: 1 } }).sort({ report_id: 1 }).toArray();
    assert.deepEqual(docs.map((d) => d.report_id), ids);
    assert.equal(await scalar("SELECT COUNT(*) FROM reports WHERE mongo_sync_status <> 'SYNCED'"), 0);
    assert.equal(await mdb.collection('category_templates').countDocuments(), 10);
  });

  test('documents keep category-specific characteristics', async () => {
    const laptop = await mdb.collection('item_details').findOne({ report_id: 3 });
    const keys = await mdb.collection('item_details').findOne({ report_id: 7 });
    assert.equal(laptop.characteristics.model, 'Inspiron 15');
    assert.equal(keys.characteristics.number_of_keys, 3);
    assert.ok(!('model' in keys.characteristics));
  });

  test('text index ranks the bottle pair first', async () => {
    const hits = await mdb.collection('item_details')
      .find({ $text: { $search: 'black bottle red sticker' } }, { projection: { report_id: 1, score: { $meta: 'textScore' } } })
      .sort({ score: { $meta: 'textScore' } }).limit(2).toArray();
    assert.deepEqual(hits.map((h) => h.report_id).sort(), [1, 2]);
  });

  test('unique report_id and JSON-schema validator', async () => {
    const items = mdb.collection('item_details');
    await assert.rejects(items.insertOne({ ...(await items.findOne({ report_id: 1 }, { projection: { _id: 0 } })) }), (e) => e.code === 11000);
    await assert.rejects(items.insertOne({ report_id: 9999, report_type: 'LOST' }), (e) => e.code === 121);
    await assert.rejects(items.updateOne({ report_id: 1 }, { $set: { report_type: 'MISPLACED' } }), (e) => e.code === 121);
  });

  test('aggregation: most frequently lost categories', async () => {
    const top = await mdb.collection('item_details').aggregate([
      { $match: { report_type: 'LOST' } },
      { $group: { _id: '$category_name', lost: { $sum: 1 } } },
      { $sort: { lost: -1, _id: 1 } },
    ]).toArray();
    assert.equal(top[0]._id, 'Electronics');
    assert.ok(top.every((r, i) => i === 0 || top[i - 1].lost >= r.lost));
  });

  test('aggregation: most common colours across characteristics', async () => {
    const colours = await mdb.collection('item_details').aggregate([
      { $project: { attrs: { $objectToArray: '$characteristics' } } },
      { $unwind: '$attrs' },
      { $match: { 'attrs.k': { $in: ['color', 'strap_color', 'frame_color', 'keychain_color'] } } },
      { $group: { _id: '$attrs.v', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 3 },
    ]).toArray();
    assert.equal(colours[0]._id, 'black');
  });

  test('aggregation: monthly trend by report type', async () => {
    const months = await mdb.collection('item_details').aggregate([
      { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$report_date' } }, type: '$report_type' }, n: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]).toArray();
    assert.deepEqual([...new Set(months.map((m) => m._id.month))], ['2026-08', '2026-09', '2026-10']);
    assert.equal(months.reduce((sum, m) => sum + m.n, 0), 72);
  });
});
