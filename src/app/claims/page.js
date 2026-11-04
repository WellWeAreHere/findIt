'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Dialog, EmptyState, LoadError, PageHeader, Skeleton, StatusBadge, Tabs } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { api, useApi } from '@/lib/client/api';
import { formatDate, timeAgo } from '@/lib/client/format';


function ClaimProgress({ status }) {
  const decided = status !== 'PENDING';
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {['Submitted', 'Under review', decided ? (status === 'APPROVED' ? 'Approved' : status === 'WITHDRAWN' ? 'Withdrawn' : 'Rejected') : 'Decision'].map((label, i) => {
        const done = i < 2 || decided;
        const tone = i === 2 && decided ? (status === 'APPROVED' ? 'bg-emerald-500' : 'bg-slate-400') : done ? 'bg-brand-500' : 'bg-slate-200';
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className={`h-px w-6 ${done ? 'bg-brand-300' : 'bg-slate-200'}`} />}
            <span className={`h-2 w-2 rounded-full ${tone}`} />
            <span className={done ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ClaimsPage() {
  const { data, error, loading, reload } = useApi('/api/claims');
  const [tab, setTab] = useState('mine');
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function withdraw() {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/claims/${withdrawing.claim_id}/withdraw`, { method: 'POST' });
      setWithdrawing(null);
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page max-w-4xl space-y-6 py-10">
      <PageHeader eyebrow="Claims" title="Ownership claims" subtitle="Track claims you made, and claims on items you found." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'mine', label: 'My claims', count: data?.mine.length },
        { value: 'incoming', label: 'On items I found', count: data?.incoming.length },
      ]} />

      {error ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : tab === 'mine' ? (
        data.mine.length ? (
          <ul className="space-y-4">
            {data.mine.map((c) => (
              <li key={c.claim_id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/items/${c.report_id}`} className="font-semibold text-slate-900 hover:text-brand-700">{c.item_name}</Link>
                    <p className="text-sm text-slate-500">{c.building_name} · found {formatDate(c.report_date)}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-4"><ClaimProgress status={c.status} /></div>
                <blockquote className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">“{c.claim_description}”</blockquote>
                {c.status === 'APPROVED' && (
                  <Alert type="success" className="mt-4" title="Approved: collect your item">
                    {c.custody_location ? <>Pick it up from <strong>{c.custody_location}</strong>.</> : 'Contact the Lost & Found desk in the Administrative Block.'}
                    {c.review_note && <span className="block text-emerald-700">Note: {c.review_note}</span>}
                  </Alert>
                )}
                {c.status === 'REJECTED' && c.review_note && <Alert type="error" className="mt-4" title="Not approved">{c.review_note}</Alert>}
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Submitted {timeAgo(c.created_at)}{c.reviewed_at && ` · reviewed ${timeAgo(c.reviewed_at)}`}</span>
                  {c.status === 'PENDING' && <Button variant="dangerGhost" size="sm" onClick={() => setWithdrawing(c)}>Withdraw</Button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon="hand" title="No claims yet" action={<Button href="/browse?type=FOUND" icon="search">Browse found items</Button>}>
          When you spot your item among found reports, open it and choose “Claim this item”.
        </EmptyState>
      ) : data.incoming.length ? (
        <ul className="card divide-y divide-slate-100">
          {data.incoming.map((c) => (
            <li key={c.claim_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <Link href={`/items/${c.report_id}`} className="font-semibold text-slate-900 hover:text-brand-700">{c.item_name}</Link>
                <p className="text-sm text-slate-500">Claimed by {c.claimant_name} · {timeAgo(c.created_at)}</p>
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="shield" title="No claims on your found items">If someone claims an item you reported, an admin verifies it and you'll be notified.</EmptyState>}

      <Dialog open={Boolean(withdrawing)} onClose={() => setWithdrawing(null)} title="Withdraw this claim?"
        footer={<>
          <Button variant="secondary" onClick={() => setWithdrawing(null)}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={withdraw}>Withdraw claim</Button>
        </>}>
        {actionError && <Alert type="error" className="mb-3">{actionError.message}</Alert>}
        You won&apos;t be able to claim the {withdrawing?.item_name} again.
      </Dialog>
    </div>
  );
}
