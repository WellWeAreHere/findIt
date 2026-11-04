import Link from 'next/link';
import { Badge, StatusBadge, TypeBadge } from './ui';
import Icon from './ui/Icon';
import { formatDate, humanize } from '@/lib/client/format';

const CATEGORY_ICONS = {
  Electronics: 'sparkles', 'Bottles & Flasks': 'box', 'Wallets & Cards': 'tag', Keys: 'link', Bags: 'box',
  'Books & Stationery': 'edit', Clothing: 'user', Accessories: 'sparkles', 'Sports Equipment': 'chart', Documents: 'tag',
};

export function ItemThumb({ item, className = 'h-40' }) {
  if (item.thumbnail) {
    return <img src={`/api/uploads/${item.thumbnail}`} alt="" className={`${className} w-full object-cover`} loading="lazy" />;
  }
  const lost = item.report_type === 'LOST';
  return (
    <div className={`${className} grid w-full place-items-center ${lost ? 'bg-gradient-to-br from-orange-50 to-amber-100/60 text-lost-600' : 'bg-gradient-to-br from-emerald-50 to-teal-100/60 text-found-600'}`}>
      <Icon name={CATEGORY_ICONS[item.category_name] ?? 'box'} className="h-10 w-10 opacity-70" strokeWidth={1.4} />
    </div>
  );
}

export default function ItemCard({ item }) {
  const chips = Object.entries(item.characteristics ?? {}).slice(0, 3);
  return (
    <Link href={`/items/${item.report_id}`}
      className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:-translate-y-0.5">
      <div className="relative">
        <ItemThumb item={item} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <TypeBadge type={item.report_type} className="bg-white/95 shadow-sm" />
          {item.status !== 'OPEN' && <StatusBadge status={item.status} className="bg-white/95" />}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.item_name} · {item.category_name}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700">{item.description}</h3>
        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chips.map(([k, v]) => <Badge key={k} tone="slate" className="font-medium" title={humanize(k)}>{String(v)}</Badge>)}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-1 pt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Icon name="pin" className="h-3.5 w-3.5" />{item.building_name} · {item.area}</span>
          <span className="flex items-center gap-1.5"><Icon name="calendar" className="h-3.5 w-3.5" />{formatDate(item.report_date)}</span>
        </div>
      </div>
    </Link>
  );
}

export function ItemGridSkeleton({ count = 8 }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="h-40 animate-pulse bg-slate-200/70" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200/70" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200/70" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
