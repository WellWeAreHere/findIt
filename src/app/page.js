'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ItemCard, { ItemGridSkeleton } from '@/components/ItemCard';
import { Button, EmptyState } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/client/api';
import { useSession } from '@/components/SessionProvider';

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
        <div className="container-page relative py-16 md:py-24">
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

      <section className="container-page py-16">
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

    </>
  );
}
