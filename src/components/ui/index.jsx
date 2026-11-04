'use client';
// Core UI primitives used across every page.
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Icon from './Icon';

const cx = (...classes) => classes.filter(Boolean).join(' ');
export { cx };

// ------------------------------------------------------------- Button
const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  dangerGhost: 'text-rose-600 hover:bg-rose-50',
};
const SIZES = { sm: 'px-3 py-1.5 text-sm gap-1.5', md: 'px-4 py-2.5 text-sm gap-2', lg: 'px-5 py-3 text-base gap-2' };

export function Button({ variant = 'primary', size = 'md', href, loading, icon, children, className, disabled, ...props }) {
  const classes = cx(
    'inline-flex items-center justify-center rounded-xl font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed',
    VARIANTS[variant], SIZES[size], className,
  );
  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </>
  );
  if (href) return <Link href={href} className={classes} {...props}>{content}</Link>;
  return <button type="button" className={classes} disabled={disabled || loading} {...props}>{content}</button>;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------- Form fields
export function Field({ label, error, hint, htmlFor, children, className, required }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}{required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
        : hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const Input = ({ error, className, ...props }) =>
  <input className={cx('input', error && 'input-error', className)} aria-invalid={Boolean(error) || undefined} {...props} />;

export const Textarea = ({ error, className, ...props }) =>
  <textarea className={cx('input min-h-28 resize-y', error && 'input-error', className)} aria-invalid={Boolean(error) || undefined} {...props} />;

export const Select = ({ error, className, children, ...props }) => (
  <div className={cx('relative', className)}>
    <select className={cx('input appearance-none pr-10', error && 'input-error')} aria-invalid={Boolean(error) || undefined} {...props}>
      {children}
    </select>
    <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  </div>
);

// ------------------------------------------------------------- Feedback
const ALERT_STYLES = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};
const ALERT_ICONS = { error: 'alert', success: 'check', info: 'info', warning: 'alert' };

export function Alert({ type = 'info', title, children, className }) {
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', ALERT_STYLES[type], className)}>
      <Icon name={ALERT_ICONS[type]} className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function EmptyState({ icon = 'box', title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="mt-4 font-semibold text-slate-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  return (
    <Alert type="error" title="Couldn't load this">
      {error?.message}
      {onRetry && <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">Try again</button>}
    </Alert>
  );
}

// ------------------------------------------------------------- Badges
const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  lost: 'bg-lost-50 text-lost-700 ring-orange-200',
  found: 'bg-found-50 text-found-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({ tone = 'slate', children, dot, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE_TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE = {
  OPEN: 'sky', RESOLVED: 'emerald', CLOSED: 'slate',
  PENDING: 'amber', APPROVED: 'emerald', REJECTED: 'rose', WITHDRAWN: 'slate',
  SUGGESTED: 'brand', CONFIRMED: 'emerald', DISMISSED: 'slate',
  SYNCED: 'emerald', FAILED: 'rose',
};
const STATUS_LABEL = { OPEN: 'Open', RESOLVED: 'Returned', CLOSED: 'Closed' };

export const StatusBadge = ({ status, className }) =>
  <Badge tone={STATUS_TONE[status] ?? 'slate'} dot className={className}>{STATUS_LABEL[status] ?? status?.charAt(0) + status?.slice(1).toLowerCase()}</Badge>;

export const TypeBadge = ({ type, className }) =>
  <Badge tone={type === 'LOST' ? 'lost' : 'found'} className={className}>{type === 'LOST' ? 'Lost' : 'Found'}</Badge>;

// ------------------------------------------------------------- Layout bits
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, action, children, className }) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {t.label}
          {t.count !== undefined && (
            <span className={cx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
      <p className="text-sm text-slate-500">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <Icon name="chevronRight" className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------- Dialog
export function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-lift backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm">
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-600">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function StatTile({ label, value, icon, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600', lost: 'bg-lost-50 text-lost-600', found: 'bg-found-50 text-found-600',
    amber: 'bg-amber-50 text-amber-600', slate: 'bg-slate-100 text-slate-600', rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <span className={cx('grid h-9 w-9 place-items-center rounded-xl', tones[tone])}><Icon name={icon} className="h-5 w-5" /></span>}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
