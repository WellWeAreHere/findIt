import { query, queryOne, sqlInt } from '../db/mysql.js';

const PUBLIC_COLUMNS = 'user_id, name, email, srn, phone, role, is_active, created_at';

export const findByEmail = (email) =>
  queryOne(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = ?`, [email]);

export const findById = (userId) =>
  queryOne(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE user_id = ?`, [userId]);

export async function insertStudent({ name, email, srn, passwordHash }) {
  const result = await query(
    "INSERT INTO users (name, email, srn, password_hash, role) VALUES (?, ?, ?, ?, 'STUDENT')",
    [name, email, srn, passwordHash],
  );
  return result.insertId;
}

// Admin user list with activity counts (correlated subqueries).
export function listWithActivity({ search, limit = 100 }) {
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE u.name LIKE ? OR u.email LIKE ? OR u.srn LIKE ?';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  return query(
    `SELECT u.user_id, u.name, u.email, u.srn, u.role, u.is_active, u.created_at,
            (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.user_id) AS report_count,
            (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.user_id) AS claim_count,
            (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.user_id AND c.status = 'REJECTED') AS rejected_claims
     FROM users u ${where}
     ORDER BY u.role, u.name
     LIMIT ${sqlInt(limit, 500)}`,
    params,
  );
}

export async function update(userId, { is_active, role }) {
  const sets = [];
  const params = [];
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (!sets.length) return 0;
  // An admin may have no SRN; promoting/demoting keeps the CHECK satisfied
  // because students always have one.
  const result = await query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
  return result.affectedRows;
}
