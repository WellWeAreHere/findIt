'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, cx } from '../ui';
import Icon from '../ui/Icon';

const LINKS = [
  ['/admin', 'Overview', 'chart'],
  ['/admin/claims', 'Claims', 'hand'],
  ['/admin/matches', 'Matches', 'sparkles'],
  ['/admin/users', 'Users', 'users'],
  ['/admin/catalog', 'Catalogue', 'grid'],
];

export default function AdminShell({ title, subtitle, actions, children }) {
  const pathname = usePathname();
  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-600"><Icon name="shield" className="h-4 w-4" />Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
        {LINKS.map(([href, label, icon]) => (
          <Link key={href} href={href}
            className={cx('flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
              pathname === href ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            <Icon name={icon} className="h-4 w-4" />{label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  );
}

// Labels where a panel's data comes from (useful in the project demo).
export function Source({ kind, children }) {
  return (
    <Badge tone={kind === 'mongo' ? 'emerald' : 'brand'} className="font-medium">
      <Icon name="database" className="h-3 w-3" />{kind === 'mongo' ? 'MongoDB' : 'MySQL'}{children && `: ${children}`}
    </Badge>
  );
}

export function Panel({ title, source, sourceKind = 'mysql', action, children, className }) {
  return (
    <section className={cx('card p-6', className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center gap-2">{source && <Source kind={sourceKind}>{source}</Source>}{action}</div>
      </div>
      {children}
    </section>
  );
}
