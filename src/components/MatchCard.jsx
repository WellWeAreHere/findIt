import Link from 'next/link';
import { Badge, StatusBadge, TypeBadge, cx } from './ui';
import Icon from './ui/Icon';
import { formatDate } from '@/lib/client/format';

export const COMPONENTS = [
  ['description_score', 'Description', 35],
  ['characteristics_score', 'Characteristics', 25],
  ['category_score', 'Category', 15],
  ['location_score', 'Location', 15],
  ['date_score', 'Date', 10],
];

export function scoreTone(score) {
  if (score >= 75) return { ring: 'text-emerald-500', text: 'text-emerald-700', label: 'Strong match' };
  if (score >= 60) return { ring: 'text-brand-500', text: 'text-brand-700', label: 'Likely match' };
  return { ring: 'text-amber-500', text: 'text-amber-700', label: 'Possible match' };
}

export function ScoreRing({ score, size = 64 }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-slate-100" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke="currentColor"
          className={tone.ring} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(score, 100) / 100)} />
      </svg>
      <span className={cx('absolute inset-0 grid place-items-center text-sm font-bold tabular-nums', tone.text)}>{Math.round(score)}%</span>
    </div>
  );
}

export function ScoreBreakdown({ match }) {
  return (
    <dl className="grid gap-1.5">
      {COMPONENTS.map(([key, label, weight]) => {
        const value = Number(match[key]);
        return (
          <div key={key} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-xs">
            <dt className="text-slate-500">{label} <span className="text-slate-400">· {weight}%</span></dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round(value * 100)}%` }} />
            </dd>
            <dd className="text-right font-semibold tabular-nums text-slate-700">{Math.round(value * 100)}%</dd>
          </div>
        );
      })}
    </dl>
  );
}

const KIND_ICON = { attribute: 'check', category: 'tag', location: 'pin', date: 'calendar', words: 'search' };

export function MatchedAttributes({ attributes = [] }) {
  const agreed = attributes.filter((a) => a.kind !== 'difference');
  const differences = attributes.filter((a) => a.kind === 'difference');
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5">
        {agreed.map((a, i) => (
          <li key={i} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <Icon name={KIND_ICON[a.kind] ?? 'check'} className="h-3.5 w-3.5" />
            {a.label}{a.value && <span className="font-normal text-emerald-700">: {a.value}</span>}
          </li>
        ))}
      </ul>
      {differences.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {differences.map((d, i) => (
            <li key={i} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">
              <Icon name="x" className="h-3.5 w-3.5" />{d.label}: {d.lost} vs {d.found}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A match from one report's point of view (other_* = the other report).
export default function MatchCard({ match, showBreakdown = true, footer }) {
  const tone = scoreTone(match.match_score);
  return (
    <article className="card p-5">
      <div className="flex gap-4">
        <ScoreRing score={match.match_score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('text-sm font-semibold', tone.text)}>{tone.label}</span>
            {match.other_type && <TypeBadge type={match.other_type} />}
            {match.match_status !== 'SUGGESTED' && <StatusBadge status={match.match_status} />}
            {match.other_status && match.other_status !== 'OPEN' && <StatusBadge status={match.other_status} />}
          </div>
          <Link href={`/items/${match.other_report_id}`} className="mt-1 block font-semibold text-slate-900 hover:text-brand-700">
            {match.other_summary}
          </Link>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
            <span>{match.other_item_name}</span>
            {match.other_building && <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3 w-3" />{match.other_building}{match.other_area && ` · ${match.other_area}`}</span>}
            {match.other_date && <span className="inline-flex items-center gap-1"><Icon name="calendar" className="h-3 w-3" />{formatDate(match.other_date)}</span>}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Why we think so</p>
          <MatchedAttributes attributes={match.matched_attributes} />
        </div>
        {showBreakdown && <ScoreBreakdown match={match} />}
        {footer}
      </div>
    </article>
  );
}

export const MatchBadge = ({ score }) => <Badge tone={score >= 75 ? 'emerald' : score >= 60 ? 'brand' : 'amber'}>{Math.round(score)}% match</Badge>;
