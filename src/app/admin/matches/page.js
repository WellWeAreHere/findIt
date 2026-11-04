'use client';
import Link from 'next/link';
import { useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { MatchedAttributes, ScoreBreakdown, ScoreRing } from '@/components/MatchCard';
import { Alert, Button, EmptyState, LoadError, Select, Skeleton, StatusBadge, Tabs, TypeBadge } from '@/components/ui';
import { api, toQuery, useApi } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';

function Side({ type, id, item, summary, reporter, building, date, status }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2"><TypeBadge type={type} />{status !== 'OPEN' && <StatusBadge status={status} />}</div>
      <Link href={`/items/${id}`} className="mt-2 block font-semibold text-slate-900 hover:text-brand-700">{summary}</Link>
      <p className="mt-1 text-xs text-slate-500">{item} · {building} · {formatDate(date)} · by {reporter}</p>
    </div>
  );
}

export default function AdminMatchesPage() {
  const [status, setStatus] = useState('SUGGESTED');
  const [minScore, setMinScore] = useState('0');
  const { data, error, loading, reload } = useApi(`/api/admin/matches${toQuery({ status, minScore })}`);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function review(matchId, matchStatus) {
    setBusy(matchId);
    setActionError(null);
    try {
      await api(`/api/admin/matches/${matchId}`, { method: 'PATCH', body: { match_status: matchStatus } });
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Match review" subtitle="Scores come from the weighted-v1 algorithm. Confirm likely pairs or dismiss false positives.">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onChange={setStatus} tabs={[
          { value: 'SUGGESTED', label: 'Suggested' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DISMISSED', label: 'Dismissed' },
        ]} />
        <label className="flex items-center gap-2 text-sm text-slate-500">Minimum score
          <Select value={minScore} onChange={(e) => setMinScore(e.target.value)} className="w-28">
            {['0', '50', '60', '75'].map((v) => <option key={v} value={v}>{v === '0' ? 'Any' : `${v}%+`}</option>)}
          </Select>
        </label>
      </div>
      {actionError && <Alert type="error" className="mb-4">{actionError.message}</Alert>}
      {error ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : data.items.length ? (
        <ul className="space-y-4">
          {data.items.map((m) => (
            <li key={m.match_id} className="card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <ScoreRing score={m.match_score} size={72} />
                <div className="flex flex-1 flex-col gap-3 md:flex-row">
                  <Side type="LOST" id={m.lost_report_id} item={m.lost_item} summary={m.lost_summary} reporter={m.lost_reporter} building={m.lost_building} date={m.lost_date} status={m.lost_status} />
                  <Side type="FOUND" id={m.found_report_id} item={m.found_item} summary={m.found_summary} reporter={m.found_reporter} building={m.found_building} date={m.found_date} status={m.found_status} />
                </div>
              </div>
              <div className="mt-4 grid gap-5 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_20rem]">
                <MatchedAttributes attributes={m.matched_attributes} />
                <ScoreBreakdown match={m} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>Match #{m.match_id} · {m.algorithm_version}</span>
                <div className="flex gap-2">
                  {m.match_status === 'SUGGESTED' && <>
                    <Button size="sm" variant="success" icon="check" loading={busy === m.match_id} onClick={() => review(m.match_id, 'CONFIRMED')}>Confirm</Button>
                    <Button size="sm" variant="secondary" icon="x" disabled={busy === m.match_id} onClick={() => review(m.match_id, 'DISMISSED')}>Dismiss</Button>
                  </>}
                  {m.match_status === 'DISMISSED' && <Button size="sm" variant="ghost" onClick={() => review(m.match_id, 'SUGGESTED')}>Restore</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="sparkles" title={`No ${status.toLowerCase()} matches`}>Matches are created automatically when new reports are submitted.</EmptyState>}
    </AdminShell>
  );
}
