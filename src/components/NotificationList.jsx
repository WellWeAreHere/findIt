'use client';
import { useRouter } from 'next/navigation';
import { EmptyState, cx } from './ui';
import Icon from './ui/Icon';
import { api } from '@/lib/client/api';
import { timeAgo } from '@/lib/client/format';

const TYPE_STYLE = {
  MATCH_FOUND: ['sparkles', 'bg-brand-50 text-brand-600'],
  CLAIM_RECEIVED: ['hand', 'bg-amber-50 text-amber-600'],
  CLAIM_APPROVED: ['check', 'bg-emerald-50 text-emerald-600'],
  CLAIM_REJECTED: ['x', 'bg-rose-50 text-rose-600'],
  REPORT_RESOLVED: ['shield', 'bg-emerald-50 text-emerald-600'],
  REMINDER: ['clock', 'bg-slate-100 text-slate-600'],
  SYSTEM: ['info', 'bg-slate-100 text-slate-600'],
};

export default function NotificationList({ items, compact = false, onChange }) {
  const router = useRouter();
  if (!items.length) return <EmptyState icon="bell" title="You're all caught up">New matches and claim updates will show up here.</EmptyState>;

  async function open(n) {
    if (!n.is_read) await api('/api/notifications', { method: 'PATCH', body: { ids: [n.notification_id] } }).catch(() => {});
    onChange?.();
    if (n.related_report_id) router.push(`/items/${n.related_report_id}`);
  }

  async function remove(n) {
    await api(`/api/notifications/${n.notification_id}`, { method: 'DELETE' }).catch(() => {});
    onChange?.();
  }

  return (
    <ul className="card divide-y divide-slate-100 overflow-hidden">
      {items.map((n) => {
        const [icon, tone] = TYPE_STYLE[n.notification_type] ?? TYPE_STYLE.SYSTEM;
        return (
          <li key={n.notification_id} className={cx('group flex gap-3 px-4 py-3.5', !n.is_read && 'bg-brand-50/40')}>
            <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tone)}><Icon name={icon} className="h-4.5 w-4.5" /></span>
            <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
              <p className={cx('text-sm', n.is_read ? 'text-slate-600' : 'font-semibold text-slate-900', compact && 'line-clamp-2')}>{n.message}</p>
              <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
            </button>
            {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
            {!compact && (
              <button type="button" onClick={() => remove(n)} aria-label="Delete notification"
                className="self-start rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
