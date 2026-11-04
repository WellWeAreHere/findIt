'use client';
import Link from 'next/link';
import { useState } from 'react';
import AdminShell, { Panel } from '@/components/admin/AdminShell';
import { MatchBadge } from '@/components/MatchCard';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, LoadError, Skeleton, StatusBadge } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { api, useApi } from '@/lib/client/api';
import { formatDate, timeAgo } from '@/lib/client/format';

export default function AdminClaimsPage() {
  const { data, error, loading, reload } = useApi('/api/admin/claims');
  const [decision, setDecision] = useState(null); // { claim, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [flash, setFlash] = useState(null);

  function openDecision(claim, action) {
    setDecision({ claim, action });
    setNote('');
    setActionError(null);
  }

  async function decide() {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/admin/claims/${decision.claim.claim_id}/${decision.action}`, { method: 'POST', body: { note: note || undefined } });
      setFlash(`Claim #${decision.claim.claim_id} ${decision.action === 'approve' ? 'approved: item marked as returned, owner notified' : 'rejected, claimant notified'}.`);
      setDecision(null);
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  // Group pending claims by item so competing claims sit together.
  const groups = Object.values((data?.pending ?? []).reduce((acc, c) => {
    (acc[c.report_id] ??= { report: c, claims: [] }).claims.push(c);
    return acc;
  }, {}));

  return (
    <AdminShell title="Claim review" subtitle="Approving a claim runs one database transaction: claim, item status, competing claims and notifications change together.">
      {flash && <Alert type="success" className="mb-6">{flash}</Alert>}
      {error ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : (
        <div className="space-y-8">
          {groups.length ? groups.map(({ report, claims }) => (
            <section key={report.report_id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                <div>
                  <Link href={`/items/${report.report_id}`} className="font-semibold text-slate-900 hover:text-brand-700">{report.item_name} <span className="font-normal text-slate-400">#{report.report_id}</span></Link>
                  <p className="text-sm text-slate-500">Found by {report.finder_name} · {report.building_name}, {report.area} · {formatDate(report.report_date)}
                    {report.custody_location && <> · held at {report.custody_location}</>}</p>
                </div>
                {claims.length > 1 && <Badge tone="amber"><Icon name="alert" className="h-3 w-3" />{claims.length} competing claims</Badge>}
              </div>
              <ul className="divide-y divide-slate-100">
                {claims.map((c) => (
                  <li key={c.claim_id} className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{c.claimant_name}</p>
                        <span className="text-sm text-slate-400">{c.claimant_email}</span>
                        {c.match_score != null && <MatchBadge score={c.match_score} />}
                        {c.lost_report_id && <Link href={`/items/${c.lost_report_id}`} className="text-xs font-semibold text-brand-600 hover:underline">linked lost report #{c.lost_report_id}</Link>}
                      </div>
                      <blockquote className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">“{c.claim_description}”</blockquote>
                      <p className="mt-2 text-xs text-slate-400">Claim #{c.claim_id} · waiting {c.hours_waiting < 48 ? `${c.hours_waiting} h` : `${Math.round(c.hours_waiting / 24)} days`}</p>
                    </div>
                    <div className="flex items-start gap-2 md:flex-col">
                      <Button variant="success" size="sm" icon="check" onClick={() => openDecision(c, 'approve')}>Approve</Button>
                      <Button variant="secondary" size="sm" icon="x" onClick={() => openDecision(c, 'reject')}>Reject</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )) : <EmptyState icon="check" title="No claims waiting">New ownership claims will appear here for verification.</EmptyState>}

          <Panel title="Recent decisions" source="claims + users">
            {data.decided.length ? (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium">Item</th><th className="pb-2 font-medium">Claimant</th><th className="pb-2 font-medium">Decision</th><th className="pb-2 font-medium">Note</th><th className="pb-2 font-medium">When</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.decided.map((c) => (
                      <tr key={c.claim_id}>
                        <td className="py-2.5"><Link href={`/items/${c.report_id}`} className="font-medium text-slate-800 hover:text-brand-700">{c.item_name}</Link></td>
                        <td className="py-2.5 text-slate-600">{c.claimant_name}</td>
                        <td className="py-2.5"><StatusBadge status={c.status} /></td>
                        <td className="max-w-56 truncate py-2.5 text-slate-500" title={c.review_note ?? ''}>{c.review_note ?? '—'}</td>
                        <td className="py-2.5 text-slate-500">{timeAgo(c.reviewed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No decisions yet.</p>}
          </Panel>
        </div>
      )}

      <Dialog open={Boolean(decision)} onClose={() => setDecision(null)}
        title={decision?.action === 'approve' ? 'Approve this claim?' : 'Reject this claim?'}
        footer={<>
          <Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button>
          <Button variant={decision?.action === 'approve' ? 'success' : 'danger'} loading={busy} onClick={decide}>
            {decision?.action === 'approve' ? 'Approve & mark returned' : 'Reject claim'}
          </Button>
        </>}>
        {actionError && <Alert type="error" className="mb-4">{actionError.message}</Alert>}
        <p>
          {decision?.action === 'approve'
            ? <>The item will be marked as returned to <strong>{decision?.claim.claimant_name}</strong>. Any other pending claims on it are rejected automatically.</>
            : <>{decision?.claim.claimant_name} will be told their claim was not approved.</>}
        </p>
        <Field label={decision?.action === 'approve' ? 'Verification note (optional)' : 'Reason (shown to the student)'} htmlFor="note" className="mt-4">
          <Input id="note" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)}
            placeholder={decision?.action === 'approve' ? 'e.g. Unlocked phone at the desk' : 'e.g. Description did not match the item'} />
        </Field>
      </Dialog>
    </AdminShell>
  );
}
