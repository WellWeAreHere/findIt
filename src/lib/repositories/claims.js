import { getPool, query, queryOne } from '../db/mysql.js';

export async function insert(conn, { report_id, claimant_id, lost_report_id, claim_description }) {
  const [result] = await conn.execute(
    'INSERT INTO claims (report_id, claimant_id, lost_report_id, claim_description) VALUES (?, ?, ?, ?)',
    [report_id, claimant_id, lost_report_id ?? null, claim_description],
  );
  return result.insertId;
}

export const findById = (claimId) => queryOne(
  `SELECT c.*, rc.item_name, rc.user_id AS finder_id
   FROM claims c JOIN v_report_card rc ON rc.report_id = c.report_id
   WHERE c.claim_id = ?`,
  [claimId],
);

export async function withdraw(conn, claimId, claimantId) {
  const [result] = await conn.execute(
    "UPDATE claims SET status = 'WITHDRAWN' WHERE claim_id = ? AND claimant_id = ? AND status = 'PENDING'",
    [claimId, claimantId],
  );
  return result.affectedRows;
}

// Claims a student has made.
export const forClaimant = (userId) => query(
  `SELECT c.claim_id, c.status, c.claim_description, c.review_note, c.created_at, c.reviewed_at,
          c.lost_report_id, rc.report_id, rc.item_name, rc.category_name, rc.building_name,
          rc.area, rc.report_date, rc.custody_location
   FROM claims c JOIN v_report_card rc ON rc.report_id = c.report_id
   WHERE c.claimant_id = ?
   ORDER BY c.created_at DESC`,
  [userId],
);

// Claims made on items a student found.
export const onFinderReports = (userId) => query(
  `SELECT c.claim_id, c.status, c.created_at, c.reviewed_at, rc.report_id, rc.item_name,
          u.name AS claimant_name
   FROM claims c
   JOIN v_report_card rc ON rc.report_id = c.report_id
   JOIN users u ON u.user_id = c.claimant_id
   WHERE rc.user_id = ?
   ORDER BY c.created_at DESC`,
  [userId],
);

export const forReport = (reportId) => query(
  `SELECT c.claim_id, c.status, c.created_at, c.claimant_id, u.name AS claimant_name
   FROM claims c JOIN users u ON u.user_id = c.claimant_id
   WHERE c.report_id = ? ORDER BY c.created_at`,
  [reportId],
);

export const pendingQueue = () => query('SELECT * FROM v_pending_claims ORDER BY created_at');

export const decided = (limit = 30) => query(
  `SELECT c.claim_id, c.status, c.review_note, c.reviewed_at, rc.report_id, rc.item_name,
          cu.name AS claimant_name, a.name AS reviewed_by_name
   FROM claims c
   JOIN v_report_card rc ON rc.report_id = c.report_id
   JOIN users cu ON cu.user_id = c.claimant_id
   LEFT JOIN users a ON a.user_id = c.reviewed_by
   WHERE c.status IN ('APPROVED', 'REJECTED')
   ORDER BY c.reviewed_at DESC LIMIT ${Number(limit) | 0}`,
);

// The transactional work lives in the stored procedures.
export const approve = (claimId, adminId, note) =>
  getPool().query('CALL sp_approve_claim(?, ?, ?)', [claimId, adminId, note ?? null]);

export const reject = (claimId, adminId, note) =>
  getPool().query('CALL sp_reject_claim(?, ?, ?)', [claimId, adminId, note ?? null]);
