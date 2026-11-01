import * as notifications from '../repositories/notifications.js';
import { notFound } from '../errors.js';

// Called inside other services' transactions so a notification is only
// stored if the change it describes is committed.
export const notifyMany = (conn, rows) => notifications.insertMany(conn, rows);

export async function inbox(userId, { unreadOnly = false, limit = 30 } = {}) {
  const [items, unread] = await Promise.all([
    notifications.forUser(userId, { unreadOnly, limit }),
    notifications.unreadCount(userId),
  ]);
  return { items: items.map((n) => ({ ...n, is_read: Boolean(n.is_read) })), unread };
}

export async function markRead(userId, { ids, all }) {
  const updated = await notifications.markRead(userId, all ? 'all' : ids);
  return { updated, unread: await notifications.unreadCount(userId) };
}

export async function remove(userId, notificationId) {
  if (!(await notifications.remove(userId, notificationId))) throw notFound('Notification not found');
}
