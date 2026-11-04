'use client';
import { useState } from 'react';
import NotificationList from '@/components/NotificationList';
import { useSession } from '@/components/SessionProvider';
import { Button, LoadError, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { api, useApi } from '@/lib/client/api';

export default function NotificationsPage() {
  const { refreshUnread } = useSession();
  const [filter, setFilter] = useState('all');
  const { data, error, loading, reload } = useApi(`/api/notifications${filter === 'unread' ? '?unread=true' : ''}`);
  const [busy, setBusy] = useState(false);

  const refresh = () => { reload(); refreshUnread(); };

  async function markAll() {
    setBusy(true);
    await api('/api/notifications', { method: 'PATCH', body: { all: true } }).catch(() => {});
    setBusy(false);
    refresh();
  }

  return (
    <div className="container-page max-w-3xl space-y-6 py-10">
      <PageHeader eyebrow="Inbox" title="Notifications" subtitle="Matches for your reports and updates on claims."
        actions={data?.unread > 0 && <Button variant="secondary" icon="check" loading={busy} onClick={markAll}>Mark all as read</Button>} />
      <Tabs value={filter} onChange={setFilter} tabs={[
        { value: 'all', label: 'All' },
        { value: 'unread', label: 'Unread', count: data?.unread },
      ]} />
      {error ? <LoadError error={error} onRetry={reload} />
        : loading && !data ? <Skeleton className="h-64" />
        : <NotificationList items={data.items} onChange={refresh} />}
    </div>
  );
}
