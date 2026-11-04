'use client';
import Link from 'next/link';
import { useState } from 'react';
import AdminShell, { Panel } from '@/components/admin/AdminShell';
import { BarList, GroupedColumns } from '@/components/admin/Charts';
import { Alert, Badge, Button, LoadError, Skeleton, StatTile, StatusBadge } from '@/components/ui';
import { api, useApi } from '@/lib/client/api';
import { formatDate, timeAgo } from '@/lib/client/format';

const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleString('en-IN', { month: 'short' });

function RecoveryTable({ rows }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="pb-2 font-medium">Category</th>
            <th className="pb-2 text-right font-medium">Lost</th>
            <th className="pb-2 text-right font-medium">Found</th>
            <th className="pb-2 text-right font-medium">Returned</th>
            <th className="pb-2 text-right font-medium">Open</th>
            <th className="w-40 pb-2 pl-4 font-medium">Lost items recovered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.filter((r) => r.total_reports > 0).map((r) => (
            <tr key={r.category_id}>
              <td className="py-2.5 font-medium text-slate-800">{r.category_name}</td>
              <td className="py-2.5 text-right tabular-nums">{r.lost_reports}</td>
              <td className="py-2.5 text-right tabular-nums">{r.found_reports}</td>
              <td className="py-2.5 text-right tabular-nums">{r.recoveries}</td>
              <td className="py-2.5 text-right tabular-nums">{r.open_reports}</td>
              <td className="py-2.5 pl-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${r.lost_recovery_rate_pct ?? 0}%` }} />
                  </span>
                  <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700">{r.lost_recovery_rate_pct ?? 0}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SyncPanel({ sync, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const queued = sync.queue.reduce((n, q) => n + q.entries, 0);
  async function run() {
    setBusy(true);
    try {
      setResult(await api('/api/admin/sync', { method: 'POST' }));
      onDone();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="MySQL → MongoDB sync" source="mongo_outbox"
      action={<Button size="sm" variant="secondary" icon="refresh" loading={busy} onClick={run}>Re-sync now</Button>}>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold tabular-nums">{queued}</p><p className="text-xs text-slate-500">Queued writes</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold tabular-nums">{sync.unsynced.length}</p><p className="text-xs text-slate-500">Reports not synced</p></div>
      </div>
      {sync.unsynced.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {sync.unsynced.slice(0, 5).map((r) => (
            <li key={r.report_id} className="flex items-center justify-between gap-2">
              <Link href={`/items/${r.report_id}`} className="truncate text-slate-700 hover:text-brand-700">#{r.report_id} {r.item_name}</Link>
              <StatusBadge status={r.mongo_sync_status} />
            </li>
          ))}
        </ul>
      )}
      {result && (
        <Alert type={result.error ? 'error' : 'success'} className="mt-4">
          {result.error ?? `Retried ${result.retried}, synced ${result.synced}, orphans removed ${result.orphansRemoved}${result.missingDetails.length ? `, ${result.missingDetails.length} missing` : ''}.`}
        </Alert>
      )}
      <p className="mt-4 text-xs text-slate-500">Failed MongoDB writes stay in the outbox and are retried automatically every 5 minutes.</p>
    </Panel>
  );
}

export default function AdminOverview() {
  const { data, error, loading, reload } = useApi('/api/admin/stats');
  const [rematch, setRematch] = useState({ busy: false, result: null });

  async function runMatching() {
    setRematch({ busy: true, result: null });
    try {
      const r = await api('/api/admin/matches', { method: 'POST' });
      setRematch({ busy: false, result: `Scored ${r.reports} open reports; ${r.matches} matches stored.` });
      reload();
    } catch (err) {
      setRematch({ busy: false, result: err.message });
    }
  }

  const actions = <Button variant="secondary" icon="sparkles" loading={rematch.busy} onClick={runMatching}>Re-run matching</Button>;

  if (error) return <AdminShell title="Overview"><LoadError error={error} onRetry={reload} /></AdminShell>;
  if (loading && !data) {
    return (
      <AdminShell title="Overview" actions={actions}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </AdminShell>
    );
  }

  const t = data.totals;
  const m = data.mongo;
  const monthly = m.monthly.map((row) => ({ group: row.month, values: row.counts }));

  return (
    <AdminShell title="Overview" subtitle="Live statistics across both databases." actions={actions}>
      {rematch.result && <Alert type="info" className="mb-6">{rematch.result}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatTile label="Total reports" value={t.total_reports} icon="box" />
        <StatTile label="Lost" value={t.lost_reports} icon="alert" tone="lost" />
        <StatTile label="Found" value={t.found_reports} icon="hand" tone="found" />
        <StatTile label="Unresolved" value={t.unresolved_reports} icon="clock" tone="amber" />
        <StatTile label="Recoveries" value={t.recoveries} icon="check" tone="found" hint="Items returned to owners" />
        <Link href="/admin/claims" className="block transition hover:-translate-y-0.5">
          <StatTile label="Pending claims" value={t.pending_claims} icon="hand" tone="rose" hint="Review now" />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Reports per month" source="$group by month" sourceKind="mongo">
          {monthly.length ? <GroupedColumns data={monthly} formatGroup={monthLabel} caption="Lost and found reports per month" />
            : <p className="text-sm text-slate-500">No reports in the last six months.</p>}
        </Panel>
        <Panel title="Most frequently lost" source="$group by category" sourceKind="mongo">
          <BarList rows={m.lostByCategory.map((c) => ({ label: c.category, value: c.lost, tooltip: `${c.lost} lost reports` }))} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Campus hotspots" source="GROUP BY … HAVING">
          <BarList segments={['LOST', 'FOUND']}
            rows={data.hotspots.map((h) => ({ label: h.building_name, value: h.total_reports, parts: { LOST: h.lost, FOUND: h.found }, tooltip: `${h.lost} lost · ${h.found} found · ${h.still_open} still open` }))} />
        </Panel>
        <Panel title="What gets lost" source="$objectToArray on characteristics" sourceKind="mongo">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Colours</p>
              <BarList rows={m.colours.map((c) => ({ label: c.value, value: c.count }))} />
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Brands</p>
              <BarList rows={m.brands.map((c) => ({ label: c.value, value: c.count }))} />
            </div>
          </div>
          {m.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
              {m.tags.map((tag) => <Badge key={tag.tag} tone="slate" className="font-medium">{tag.tag} <span className="text-slate-400">{tag.count}</span></Badge>)}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Recovery rate by category" source="v_recovery_stats">
        <RecoveryTable rows={data.recoveryByCategory} />
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Longest unresolved" source="v_unresolved_reports">
          <ul className="divide-y divide-slate-100">
            {data.oldestUnresolved.map((r) => (
              <li key={r.report_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/items/${r.report_id}`} className="min-w-0">
                  <span className="block truncate font-medium text-slate-800 hover:text-brand-700">{r.item_name} <span className="font-normal text-slate-400">· {r.building_name}</span></span>
                  <span className="text-xs text-slate-500">{r.report_type === 'LOST' ? 'Lost' : 'Found'} by {r.reporter_name} · {r.days_open} days open</span>
                </Link>
                <span className="flex shrink-0 gap-1.5">
                  {r.pending_claims > 0 && <Badge tone="amber">{r.pending_claims} claim{r.pending_claims > 1 && 's'}</Badge>}
                  {r.best_match_score != null && <Badge tone="brand">{Math.round(r.best_match_score)}%</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Lost items with no match yet" source="NOT EXISTS subquery">
          {data.unmatchedLost.length ? (
            <ul className="divide-y divide-slate-100">
              {data.unmatchedLost.map((r) => (
                <li key={r.report_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/items/${r.report_id}`} className="truncate font-medium text-slate-800 hover:text-brand-700">{r.item_name} <span className="font-normal text-slate-400">· {r.building_name}</span></Link>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(r.report_date)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">Every open lost report has at least one suggested match.</p>}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent activity" source="status_audit_log (triggers)">
          <ul className="divide-y divide-slate-100">
            {data.auditTrail.map((a) => (
              <li key={a.audit_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{a.subject ?? `${a.entity_type} #${a.entity_id}`}</span>
                  <span className="text-xs text-slate-500">{a.changed_by_name ?? 'System'} · {timeAgo(a.changed_at)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                  {a.old_status && <><StatusBadge status={a.old_status} /> →</>}<StatusBadge status={a.new_status} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <SyncPanel sync={data.sync} onDone={reload} />
      </div>
    </AdminShell>
  );
}
