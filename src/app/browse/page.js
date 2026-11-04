'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import ItemCard, { ItemGridSkeleton } from '@/components/ItemCard';
import { Button, EmptyState, Field, Input, LoadError, PageHeader, Pagination, Select, cx } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { toQuery, useApi } from '@/lib/client/api';
import { plural } from '@/lib/client/format';

const FILTER_KEYS = ['q', 'type', 'status', 'category', 'building', 'from', 'to', 'sort', 'page'];

function Browse() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']));
  const page = Number(filters.page) || 1;
  const [q, setQ] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => setQ(filters.q), [filters.q]);

  const catalog = useApi('/api/catalog');
  // The status filter defaults to Open when browsing and Any when searching.
  const statusValue = filters.status || (filters.q ? 'ANY' : 'OPEN');
  const results = useApi(`/api/reports${toQuery({ ...filters, status: statusValue === 'ANY' ? '' : statusValue, pageSize: 12 })}`);

  function update(changes) {
    const next = { ...filters, ...changes };
    if (!('page' in changes)) next.page = '';
    router.push(`${pathname}${toQuery(next)}`, { scroll: false });
  }

  const activeCount = ['type', 'category', 'building', 'from', 'to'].filter((k) => filters[k]).length;

  return (
    <div className="container-page py-10">
      <PageHeader eyebrow="Browse" title="Lost & found items"
        subtitle="Search everything reported on campus. Found your item? Open it and submit a claim." />

      <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <label htmlFor="search" className="sr-only">Search</label>
          <Input id="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-11"
            placeholder="Search by description, brand, colour, sticker…" />
        </div>
        <Button type="submit">Search</Button>
        <Button variant="secondary" className="lg:hidden" onClick={() => setShowFilters((s) => !s)} icon="grid">
          Filters{activeCount ? ` (${activeCount})` : ''}
        </Button>
      </form>

      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className={cx('space-y-5 lg:block', showFilters ? 'block' : 'hidden')}>
          <div className="card space-y-4 p-5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {[['', 'All'], ['LOST', 'Lost'], ['FOUND', 'Found']].map(([v, label]) => (
                <button key={label} type="button" onClick={() => update({ type: v })}
                  className={cx('rounded-lg py-1.5 transition', filters.type === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {label}
                </button>
              ))}
            </div>
            <Field label="Status" htmlFor="f-status">
              <Select id="f-status" value={statusValue} onChange={(e) => update({ status: e.target.value })}>
                <option value="ANY">Any status</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Returned</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="f-category">
              <Select id="f-category" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
                <option value="">All categories</option>
                {catalog.data?.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
              </Select>
            </Field>
            <Field label="Building" htmlFor="f-building">
              <Select id="f-building" value={filters.building} onChange={(e) => update({ building: e.target.value })}>
                <option value="">Anywhere on campus</option>
                {catalog.data?.buildings.map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" htmlFor="f-from">
                <Input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} className="px-2.5" />
              </Field>
              <Field label="To" htmlFor="f-to">
                <Input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} className="px-2.5" />
              </Field>
            </div>
            {(activeCount > 0 || filters.q || filters.status) && (
              <Button variant="ghost" size="sm" className="w-full" icon="x" onClick={() => router.push(pathname)}>Clear all filters</Button>
            )}
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {results.data ? <>{plural(results.data.total, 'item')}{filters.q && <> for “<span className="font-semibold text-slate-800">{filters.q}</span>”</>}</> : 'Loading…'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="sort" className="text-slate-500">Sort</label>
              <Select id="sort" value={filters.sort || (filters.q ? 'relevance' : 'newest')} onChange={(e) => update({ sort: e.target.value })} className="w-40">
                {filters.q && <option value="relevance">Best match</option>}
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </Select>
            </div>
          </div>

          {results.error ? <LoadError error={results.error} onRetry={results.reload} />
            : results.loading && !results.data ? <ItemGridSkeleton count={6} />
            : results.data?.items.length ? (
              <div className={cx('space-y-8 transition-opacity', results.loading && 'opacity-60')}>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {results.data.items.map((item) => <ItemCard key={item.report_id} item={item} />)}
                </div>
                <Pagination page={page} pageSize={results.data.pageSize} total={results.data.total} onChange={(p) => update({ page: String(p) })} />
              </div>
            ) : (
              <EmptyState icon="search" title="No items match"
                action={<Button href="/report/new" icon="plus">Report an item</Button>}>
                Try fewer words or remove a filter. If you lost something, report it and we&apos;ll tell you when a match turns up.
              </EmptyState>
            )}
        </div>
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return <Suspense fallback={<div className="container-page py-10"><ItemGridSkeleton /></div>}><Browse /></Suspense>;
}
