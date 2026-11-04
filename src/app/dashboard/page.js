'use client';
import Link from 'next/link';
import { useState } from 'react';
import MatchCard from '@/components/MatchCard';
import NotificationList from '@/components/NotificationList';
import { useSession } from '@/components/SessionProvider';
import { Badge, Button, EmptyState, LoadError, PageHeader, Section, Skeleton, StatTile, StatusBadge, Tabs } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/client/api';
import { formatDate, timeAgo } from '@/lib/client/format';

function ReportRow({ r }) {
  return (
    <li>
      <Link href={`/items/${r.report_id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{r.description}</p>
          <p className="mt-0.5 text-sm text-slate-500">{r.item_name} · {r.building_name} · {formatDate(r.report_date)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          {r.best_match_score != null && r.status === 'OPEN' && (
            <Badge tone={r.best_match_score >= 60 ? 'brand' : 'slate'}><Icon name="sparkles" className="h-3 w-3" />{Math.round(r.best_match_score)}%</Badge>
          )}
          {r.pending_claims > 0 && <Badge tone="amber">{r.pending_claims} claim{r.pending_claims > 1 ? 's' : ''}</Badge>}
          <StatusBadge status={r.status} />
        </div>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-slate-300" />
      </Link>
    </li>
  );
}

function ReportList({ items, type }) {
  if (!items.length) {
    return (
      <EmptyState icon={type === 'LOST' ? 'alert' : 'hand'} title={type === 'LOST' ? "You haven't reported anything lost" : "You haven't reported anything found"}
        action={<Button href={`/report/new?type=${type}`} icon="plus">Report {type === 'LOST' ? 'a lost' : 'a found'} item</Button>} />
    );
  }
  return <ul className="card divide-y divide-slate-100 overflow-hidden">{items.map((r) => <ReportRow key={r.report_id} r={r} />)}</ul>;
}

export default function DashboardPage() {
  const { user, refreshUnread } = useSession();
  const { data, error, loading, reload } = useApi('/api/me/dashboard');
  const [tab, setTab] = useState('lost');

  if (error) return <div className="container-page py-10"><LoadError error={error} onRetry={reload} /></div>;

  const pendingClaims = data?.claims.filter((c) => c.status === 'PENDING') ?? [];
  const openCount = data ? [...data.lost, ...data.found].filter((r) => r.status === 'OPEN').length : null;
  const returned = data ? data.claims.filter((c) => c.status === 'APPROVED').length + data.found.filter((r) => r.status === 'RESOLVED').length : null;

  return (
    <div className="container-page space-y-10 py-10">
      <PageHeader eyebrow="Dashboard" title={user ? `Hi, ${user.name.split(' ')[0]}` : 'Dashboard'}
        subtitle="Your reports, matches and claims in one place."
        actions={<>
          <Button href="/report/new?type=LOST" variant="secondary" icon="alert">Report lost</Button>
          <Button href="/report/new?type=FOUND" icon="hand">Report found</Button>
        </>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open reports" value={openCount} icon="box" />
        <StatTile label="Potential matches" value={data?.matches.length} icon="sparkles" tone="found" />
        <StatTile label="Pending claims" value={data ? pendingClaims.length : null} icon="clock" tone="amber" />
        <StatTile label="Items recovered" value={returned} icon="check" tone="slate" />
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-10">
          <Section title="My reports">
            <div className="mb-4">
              <Tabs value={tab} onChange={setTab} tabs={[
                { value: 'lost', label: 'Lost', count: data?.lost.length },
                { value: 'found', label: 'Found', count: data?.found.length },
              ]} />
            </div>
            {loading && !data ? <Skeleton className="h-48" /> : <ReportList items={tab === 'lost' ? data.lost : data.found} type={tab === 'lost' ? 'LOST' : 'FOUND'} />}
          </Section>

          <Section title="Potential matches" description="Reports from other people that look like yours. Open one to claim it or check details.">
            {loading && !data ? <Skeleton className="h-48" /> : data.matches.length ? (
              <div className="grid gap-4">
                {data.matches.slice(0, 6).map((m) => (
                  <MatchCard key={m.match_id} match={{ ...m, other_type: m.my_type === 'LOST' ? 'FOUND' : 'LOST' }} showBreakdown={false}
                    footer={<p className="text-xs text-slate-500">Matches your report: <Link href={`/items/${m.my_report_id}`} className="font-semibold text-brand-600 hover:underline">{m.my_item_name}</Link></p>} />
                ))}
              </div>
            ) : <EmptyState icon="sparkles" title="No matches yet">We'll notify you as soon as something similar is reported.</EmptyState>}
          </Section>
        </div>

        <aside className="space-y-10">
          <Section title="My claims" action={<Link href="/claims" className="text-sm font-semibold text-brand-600 hover:text-brand-700">All claims</Link>}>
            {loading && !data ? <Skeleton className="h-32" /> : data.claims.length ? (
              <ul className="card divide-y divide-slate-100">
                {data.claims.slice(0, 5).map((c) => (
                  <li key={c.claim_id}>
                    <Link href={`/items/${c.report_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{c.item_name}</span>
                        <span className="text-xs text-slate-500">{timeAgo(c.created_at)}</span></span>
                      <StatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="card p-4 text-sm text-slate-500">You haven&apos;t claimed anything.</p>}
          </Section>

          <Section title="Notifications" action={<Link href="/notifications" className="text-sm font-semibold text-brand-600 hover:text-brand-700">See all</Link>}>
            {loading && !data ? <Skeleton className="h-48" />
              : <NotificationList items={data.notifications.items.slice(0, 6)} compact onChange={() => { reload(); refreshUnread(); }} />}
          </Section>
        </aside>
      </div>
    </div>
  );
}
