import { placeholders, query, queryOne, sqlInt } from '../db/mysql.js';

// rows: [{ user_id, related_report_id, message, notification_type }]
export async function insertMany(conn, rows) {
  if (!rows.length) return;
  await conn.query(
    'INSERT INTO notifications (user_id, related_report_id, message, notification_type) VALUES ?',
    [rows.map((r) => [r.user_id, r.related_report_id ?? null, r.message.slice(0, 255), r.notification_type])],
  );
}

export const forUser = (userId, { unreadOnly = false, limit = 30 } = {}) => query(
  `SELECT notification_id, related_report_id, message, notification_type, is_read, created_at
   FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = FALSE' : ''}
   ORDER BY created_at DESC, notification_id DESC LIMIT ${sqlInt(limit, 100)}`,
  [userId],
);

export const unreadCount = async (userId) =>
  (await queryOne('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId])).n;

export async function markRead(userId, ids) {
  if (ids === 'all') {
    return (await query('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [userId])).affectedRows;
  }
  return (await query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND notification_id IN (${placeholders(ids)})`,
    [userId, ...ids],
  )).affectedRows;
}

export async function remove(userId, notificationId) {
  return (await query('DELETE FROM notifications WHERE notification_id = ? AND user_id = ?', [notificationId, userId])).affectedRows;
}
