'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ItemCard, { ItemGridSkeleton } from '@/components/ItemCard';
import { Button, EmptyState } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/client/api';
import { useSession } from '@/components/SessionProvider';

const STEPS = [
  { icon: 'edit', title: 'Report it', text: 'Describe what you lost or found: where, when, and what makes it unique.' },
  { icon: 'sparkles', title: 'Get matched', text: 'FindIt compares descriptions, details, place and time to suggest likely matches.' },
  { icon: 'hand', title: 'Claim it', text: 'Spot your item? Submit a claim with proof only the owner would know.' },
  { icon: 'shield', title: 'Collect it', text: 'An admin verifies the claim and you pick it up from the Lost & Found desk.' },
];

function HeroMatchPreview() {
  const rows = [['Description', 56], ['Characteristics', 100], ['Category', 100], ['Location', 80], ['Date', 93]];
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-200/50 via-white to-emerald-100/60 blur-2xl" />
      <div className="relative space-y-3">
        <div className="card ml-8 rotate-2 p-4">
          <span className="rounded-full bg-lost-50 px-2 py-0.5 text-xs font-semibold text-lost-700 ring-1 ring-orange-200">Lost</span>
          <p className="mt-2 text-sm font-semibold text-slate-800">Black Milton bottle, red guitar sticker</p>
          <p className="mt-1 text-xs text-slate-500">Central Library · reading area</p>
        </div>
        <div className="card -rotate-1 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-found-50 px-2 py-0.5 text-xs font-semibold text-found-700 ring-1 ring-emerald-200">Found</span>
            <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">73% match</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">Black steel bottle with red sticker</p>
          <div className="mt-3 space-y-1.5">
            {rows.map(([label, pct]) => (
              <div key={label} className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-24">{label}</span>
                <span className="h-1.5 flex-1 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [q, setQ] = useState('');
  const recent = useApi('/api/reports/recent');
  const stats = useApi('/api/stats');

  const reportHref = (type) => (user ? `/report/new?type=${type}` : `/login?next=${encodeURIComponent(`/report/new?type=${type}`)}`);

  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--color-brand-50),transparent_60%)]" />
        <div className="container-page relative grid items-center gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <Icon name="sparkles" className="h-3.5 w-3.5" /> Campus lost &amp; found, with smart matching
            </p>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Lost something on campus? <span className="text-brand-600">Let&apos;s get it back.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Report lost and found items in one place. FindIt matches them by description, details,
              location and date, so the right item reaches the right person.
            </p>
            <form className="mt-8 flex max-w-xl gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-card"
              onSubmit={(e) => { e.preventDefault(); router.push(`/browse${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}>
              <label htmlFor="hero-search" className="sr-only">Search items</label>
              <div className="flex flex-1 items-center gap-2 px-2">
                <Icon name="search" className="h-5 w-5 text-slate-400" />
                <input id="hero-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “black bottle” or “Dell laptop”"
                  className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" />
              </div>
              <Button type="submit">Search</Button>
            </form>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href={reportHref('LOST')} variant="secondary" icon="alert">I lost something</Button>
              <Button href={reportHref('FOUND')} variant="secondary" icon="hand">I found something</Button>
            </div>
          </div>
          <HeroMatchPreview />
        </div>
      </section>

      <section className="container-page -mt-px grid grid-cols-3 divide-x divide-slate-200 rounded-b-2xl border-x border-b border-slate-200/70 bg-white text-center">
        {[
          ['Items reported', stats.data?.total_reports],
          ['Returned to owners', stats.data?.recoveries],
          ['Still looking', stats.data?.unresolved_reports],
        ].map(([label, value]) => (
          <div key={label} className="px-2 py-6">
            <p className="text-2xl font-bold text-slate-900 tabular-nums sm:text-3xl">{value ?? '–'}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
          </div>
        ))}
      </section>

      <section className="container-page py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">How it works</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">From “where did it go?” to “got it back” in four steps</h2>
        </div>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative p-6">
              <span className="absolute right-5 top-5 text-4xl font-black text-slate-100">{i + 1}</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon name={s.icon} /></span>
              <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">Recently reported</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Seen any of these?</h2>
          </div>
          <Button href="/browse" variant="ghost">View all <Icon name="arrowRight" className="h-4 w-4" /></Button>
        </div>
        {recent.loading ? <ItemGridSkeleton /> : recent.data?.items?.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.data.items.map((item) => <ItemCard key={item.report_id} item={item} />)}
          </div>
        ) : <EmptyState title="Nothing reported yet">Be the first to report a lost or found item.</EmptyState>}
      </section>

      {!user && (
        <section className="container-page mt-20">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-12 text-white sm:px-12">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
            <div className="relative max-w-xl">
              <h2 className="text-2xl font-bold sm:text-3xl">Join FindIt with your university email</h2>
              <p className="mt-3 text-brand-100">Get notified the moment something matching your lost item turns up.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/register" className="bg-white !text-brand-700 hover:bg-brand-50">Create a free account</Button>
                <Button href="/login" variant="ghost" className="!text-white hover:bg-white/10">I already have one</Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
