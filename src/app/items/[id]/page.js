'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import ClaimPanel from '@/components/ClaimPanel';
import MatchCard from '@/components/MatchCard';
import { ItemThumb } from '@/components/ItemCard';
import { useSession } from '@/components/SessionProvider';
import { Alert, Badge, Button, Dialog, EmptyState, LoadError, Section, Skeleton, StatusBadge, TypeBadge } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { api, useApi } from '@/lib/client/api';
import { formatDate, formatDateTime, humanize, timeAgo } from '@/lib/client/format';

const EVENT_LABELS = {
  CREATED: 'Report created', EDITED: 'Details updated', IMAGE_ADDED: 'Photo added', MATCH_RUN: 'Matching run',
  CLAIM_SUBMITTED: 'Claim submitted', CLAIM_DECIDED: 'Claim reviewed', STATUS_CHANGED: 'Status changed', RESYNCED: 'Details re-synced',
};

function Gallery({ report, images }) {
  const [active, setActive] = useState(0);
  if (!images.length) return <div className="overflow-hidden rounded-2xl"><ItemThumb item={report} className="h-64 sm:h-80" /></div>;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-slate-100">
        <img src={`/api/uploads/${images[active].file}`} alt={`Photo ${active + 1} of the item`} className="h-64 w-full object-contain sm:h-80" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img, i) => (
            <button key={img.file} type="button" onClick={() => setActive(i)}
              className={`h-16 w-16 overflow-hidden rounded-xl ring-2 transition ${i === active ? 'ring-brand-500' : 'ring-transparent hover:ring-slate-300'}`}>
              <img src={`/api/uploads/${img.file}`} alt={`Show photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerActions({ data, reload }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const [dialog, setDialog] = useState(null); // 'close' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { report, details } = data;
  const open = report.status === 'OPEN';
  const images = details?.images ?? [];

  async function run(fn) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(err); } finally { setBusy(false); }
  }

  const upload = (file) => run(async () => {
    const form = new FormData();
    form.append('image', file);
    await api(`/api/reports/${report.report_id}/images`, { method: 'POST', body: form });
    await reload();
  });

  return (
    <div className="card space-y-3 p-5">
      <p className="font-semibold text-slate-900">Manage your report</p>
      {error && <Alert type="error">{error.message}</Alert>}
      {open && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon="edit" href={`/report/${report.report_id}/edit`}>Edit</Button>
          <Button variant="secondary" size="sm" icon="upload" loading={busy} disabled={images.length >= 3}
            onClick={() => fileInput.current?.click()}>Add photo</Button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}
      {images.length > 0 && open && (
        <ul className="flex flex-wrap gap-2">
          {images.map((img) => (
            <li key={img.file} className="relative">
              <img src={`/api/uploads/${img.file}`} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <button type="button" aria-label="Remove photo"
                onClick={() => run(async () => { await api(`/api/reports/${report.report_id}/images/${img.file}`, { method: 'DELETE' }); await reload(); })}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-800 text-white hover:bg-rose-600">
                <Icon name="x" className="h-3 w-3" strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && images.length < 3 && <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 5 MB, max 3 photos.</p>}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {open && <Button variant="ghost" size="sm" onClick={() => setDialog('close')}>Mark as closed</Button>}
        {data.canDelete && <Button variant="dangerGhost" size="sm" icon="trash" onClick={() => setDialog('delete')}>Delete</Button>}
      </div>

      <Dialog open={dialog === 'close'} onClose={() => setDialog(null)} title="Close this report?"
        footer={<>
          <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button loading={busy} onClick={() => run(async () => { await api(`/api/reports/${report.report_id}/close`, { method: 'POST' }); setDialog(null); await reload(); })}>Close report</Button>
        </>}>
        Closing means you no longer need help with this item. It will stop appearing in matches. This can&apos;t be undone.
      </Dialog>
      <Dialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this report?"
        footer={<>
          <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => run(async () => { await api(`/api/reports/${report.report_id}`, { method: 'DELETE' }); router.push('/dashboard'); })}>Delete permanently</Button>
        </>}>
        The report, its photos and its matches will be removed from both databases.
      </Dialog>
    </div>
  );
}

function ItemDetail() {
  const { id } = useParams();
  const search = useSearchParams();
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(`/api/reports/${id}`);

  if (loading && !data) {
    return (
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4"><Skeleton className="h-80" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) return <div className="container-page py-10"><LoadError error={error} onRetry={reload} /></div>;

  const { report, details, matches, claims, activity, isOwner, claimContext } = data;
  const isAdmin = user?.role === 'ADMIN';
  const lost = report.report_type === 'LOST';
  const characteristics = Object.entries(details?.characteristics ?? {});
  const justCreated = search.get('created') === '1';

  return (
    <div className="container-page py-8">
      <Link href="/browse" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <Icon name="chevronLeft" className="h-4 w-4" /> Back to browse
      </Link>

      {justCreated && (
        <Alert type="success" className="mt-4" title="Your report is live">
          {matches?.length
            ? `We found ${matches.length} potential match${matches.length === 1 ? '' : 'es'}. See below.`
            : "No matches yet. We'll notify you as soon as something similar is reported."}
        </Alert>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <Gallery report={report} images={details?.images ?? []} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={report.report_type} />
              <StatusBadge status={report.status} />
              <Badge tone="slate">{report.category_name}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{report.description}</h1>
            <p className="mt-1 text-slate-500">{report.item_name}</p>
          </div>

          {data.detailsSyncing ? (
            <Alert type="warning" title="Details are syncing">The full description and characteristics will appear shortly.</Alert>
          ) : (
            <>
              <Section title="Description">
                <p className="whitespace-pre-line leading-relaxed text-slate-700">{details.description}</p>
              </Section>
              {characteristics.length > 0 && (
                <Section title="Characteristics">
                  <dl className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
                    {characteristics.map(([k, v]) => (
                      <div key={k} className="bg-white px-4 py-3">
                        <dt className="text-xs font-medium text-slate-500">{humanize(k)}</dt>
                        <dd className="mt-0.5 font-medium text-slate-900">{String(v)}</dd>
                      </div>
                    ))}
                    {characteristics.length % 2 === 1 && <div className="hidden bg-white sm:block" />}
                  </dl>
                </Section>
              )}
            </>
          )}

          {matches && (
            <Section title="Potential matches" description={lost ? 'Found reports that look like this item.' : 'Lost reports that may belong to the owner.'}>
              {matches.length ? (
                <div className="grid gap-4">{matches.map((m) => <MatchCard key={m.match_id} match={m} />)}</div>
              ) : (
                <EmptyState icon="sparkles" title="No matches yet">We check every new report automatically and will notify you when something similar appears.</EmptyState>
              )}
            </Section>
          )}

          {claims && claims.length > 0 && (
            <Section title="Claims on this item">
              <ul className="card divide-y divide-slate-100">
                {claims.map((c) => (
                  <li key={c.claim_id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span><span className="font-medium text-slate-800">{c.claimant_name}</span> <span className="text-slate-400">· {timeAgo(c.created_at)}</span></span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
              {isAdmin && <Button href="/admin/claims" variant="ghost" size="sm" className="mt-2">Review in claim queue <Icon name="arrowRight" className="h-4 w-4" /></Button>}
            </Section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card divide-y divide-slate-100">
            {[
              ['pin', lost ? 'Last seen' : 'Found at', <>{report.building_name}<span className="block text-sm font-normal text-slate-500">{report.area}{report.floor !== 0 && ` · ${report.floor < 0 ? 'Basement' : `Floor ${report.floor}`}`}</span></>],
              ['calendar', lost ? 'Lost on' : 'Found on', formatDate(report.report_date)],
              ...(report.custody_location ? [['shield', 'Collect from', report.custody_location]] : []),
              ['user', 'Reported by', <>{report.reporter_name?.split(' ')[0]}<span className="block text-sm font-normal text-slate-500">{formatDateTime(report.created_at)}</span></>],
            ].map(([icon, label, value]) => (
              <div key={label} className="flex gap-3 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon name={icon} className="h-4.5 w-4.5" /></span>
                <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="font-semibold text-slate-900">{value}</p></div>
              </div>
            ))}
          </div>

          {isOwner && <OwnerActions data={data} reload={reload} />}
          {!isOwner && isAdmin && report.status === 'OPEN' && (
            <div className="card p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Admin</p>
              <p className="mt-1">You can see matches and claims for this report.</p>
            </div>
          )}
          {claimContext && <ClaimPanel reportId={report.report_id} context={claimContext} onClaimed={reload} />}
          {!user && !lost && report.status === 'OPEN' && (
            <div className="card p-5">
              <p className="font-semibold text-slate-900">Is this yours?</p>
              <p className="mt-1 text-sm text-slate-600">Log in to claim it.</p>
              <Button href={`/login?next=/items/${report.report_id}`} className="mt-4 w-full">Log in to claim</Button>
            </div>
          )}
          {lost && !isOwner && report.status === 'OPEN' && user && (
            <Alert type="info" title="Found this item?">Hand it to the Security Office and <Link className="font-semibold underline" href="/report/new?type=FOUND">report it as found</Link>. We&apos;ll match it automatically.</Alert>
          )}

          {activity.length > 0 && (
            <div className="card p-5">
              <p className="font-semibold text-slate-900">Activity</p>
              <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
                {activity.slice(0, 8).map((a, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-400 ring-4 ring-white" />
                    <p className="font-medium text-slate-700">{EVENT_LABELS[a.event] ?? a.event}
                      {a.event === 'MATCH_RUN' && a.data && <span className="font-normal text-slate-500"> · {a.data.stored} match{a.data.stored === 1 ? '' : 'es'}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(a.at)}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function ItemPage() {
  return <Suspense><ItemDetail /></Suspense>;
}
