'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Field, Select, StatusBadge, Textarea } from './ui';
import Icon from './ui/Icon';
import { api } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';

// Shown on someone else's open FOUND item to a signed-in student.
export default function ClaimPanel({ reportId, context, onClaimed }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ claim_description: '', lost_report_id: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (context.existingClaim) {
    const c = context.existingClaim;
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-900">Your claim</p>
          <StatusBadge status={c.status} />
        </div>
        <p className="mt-2 text-sm text-slate-500">Submitted {formatDate(c.created_at)}. {c.status === 'PENDING' && 'An admin will verify it soon.'}</p>
        <Link href="/claims" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
          View my claims <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/claims', {
        method: 'POST',
        body: { report_id: reportId, claim_description: form.claim_description, lost_report_id: form.lost_report_id || undefined },
      });
      onClaimed?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="card bg-gradient-to-br from-brand-50 to-white p-5">
        <p className="font-semibold text-slate-900">Is this yours?</p>
        <p className="mt-1 text-sm text-slate-600">Submit a claim with details only the owner would know. An admin will verify it before handover.</p>
        <Button className="mt-4 w-full" icon="hand" onClick={() => setOpen(true)}>Claim this item</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <p className="font-semibold text-slate-900">Claim this item</p>
      {error && !error.fields?.claim_description && <Alert type="error">{error.message}</Alert>}
      <Field label="Proof of ownership" htmlFor="proof" required error={error?.fields?.claim_description}
        hint="E.g. a scratch, sticker, lock-screen photo, what's inside. At least 20 characters.">
        <Textarea id="proof" value={form.claim_description} maxLength={2000}
          onChange={(e) => setForm({ ...form, claim_description: e.target.value })} error={error?.fields?.claim_description} />
      </Field>
      {context.myOpenLostReports.length > 0 && (
        <Field label="Link your lost report (optional)" htmlFor="lost" hint="Helps the admin verify faster.">
          <Select id="lost" value={form.lost_report_id} onChange={(e) => setForm({ ...form, lost_report_id: e.target.value })}>
            <option value="">Don&apos;t link a report</option>
            {context.myOpenLostReports.map((r) => (
              <option key={r.report_id} value={r.report_id}>{r.item_name}: {r.description} ({formatDate(r.report_date)})</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={busy} className="flex-1">Submit claim</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
