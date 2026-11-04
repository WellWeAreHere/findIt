'use client';
// Small dependency-free charts for the admin dashboard.
// Colours come from the validated reference palette: lost = orange,
// found = aqua (CVD-safe pair), single series = blue. Aqua is below 3:1
// contrast, so values are always labelled and a table view is provided.
import { useState } from 'react';
import { cx } from '../ui';

export const SERIES = {
  LOST: { label: 'Lost', color: '#eb6834' },
  FOUND: { label: 'Found', color: '#1baf7a' },
};
export const SINGLE = '#2a78d6';

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-slate-600">
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, children }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

function ViewToggle({ table, setTable }) {
  return (
    <button type="button" onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
      {table ? 'Show chart' : 'Show table'}
    </button>
  );
}

// Bar path with a 4px rounded data-end and a square baseline.
function columnPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// Rounds up to an even number so the middle gridline is a whole number.
const niceMax = (v) => {
  const unit = v <= 10 ? 2 : v <= 50 ? 10 : 10 ** Math.floor(Math.log10(v));
  return Math.max(4, Math.ceil(v / unit) * unit);
};

// Grouped columns: one group per category (e.g. month), one column per series.
export function GroupedColumns({ data, keys = ['LOST', 'FOUND'], formatGroup = (g) => g, height = 220, caption }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const width = 560;
  const pad = { top: 20, right: 8, bottom: 28, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => keys.map((k) => d.values[k] ?? 0))));
  const band = innerW / Math.max(1, data.length);
  const bar = Math.min(24, (band * 0.6) / keys.length);
  const gap = 2;
  const ticks = [0, max / 2, max];
  const y = (v) => pad.top + innerH - (v / max) * innerH;

  return (
    <figure>
      <div className="mb-3 flex items-center justify-between gap-4">
        <Legend items={keys.map((k) => SERIES[k])} />
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Month</th>{keys.map((k) => <th key={k} className="py-1.5 text-right font-medium">{SERIES[k].label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((d) => <tr key={d.group}><td className="py-1.5">{formatGroup(d.group)}</td>{keys.map((k) => <td key={k} className="py-1.5 text-right tabular-nums">{d.values[k] ?? 0}</td>)}</tr>)}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={caption}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px]">{t}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const groupW = keys.length * bar + (keys.length - 1) * gap;
              const x0 = pad.left + i * band + (band - groupW) / 2;
              return (
                <g key={d.group}>
                  <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                  {keys.map((k, j) => {
                    const v = d.values[k] ?? 0;
                    const x = x0 + j * (bar + gap);
                    return (
                      <g key={k} className="pointer-events-none">
                        <path d={columnPath(x, y(v), bar, pad.top + innerH - y(v))} fill={SERIES[k].color} opacity={hover === null || hover === i ? 1 : 0.45} />
                        {v > 0 && <text x={x + bar / 2} y={y(v) - 5} textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold">{v}</text>}
                      </g>
                    );
                  })}
                  <text x={pad.left + i * band + band / 2} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">{formatGroup(d.group)}</text>
                </g>
              );
            })}
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#cbd5e1" strokeWidth="1" />
          </svg>
          {hover !== null && (
            <Tooltip x={`${((pad.left + hover * band + band / 2) / width) * 100}%`} y={0}>
              <p className="font-semibold">{formatGroup(data[hover].group)}</p>
              {keys.map((k) => (
                <p key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[k].color }} />{SERIES[k].label}: {data[hover].values[k] ?? 0}</p>
              ))}
            </Tooltip>
          )}
        </div>
      )}
      {caption && <figcaption className="sr-only">{caption}</figcaption>}
    </figure>
  );
}

// Horizontal bar list: label, bar from a common baseline, value at the tip.
// `segments` (optional) splits each bar into lost/found with a 2px gap.
export function BarList({ rows, segments, valueLabel = (r) => r.value, max: forcedMax }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const max = forcedMax ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        {segments ? <Legend items={segments.map((k) => SERIES[k])} /> : <span />}
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-1.5">{r.label}</td>
                {segments ? segments.map((k) => <td key={k} className="py-1.5 text-right tabular-nums text-slate-500">{SERIES[k].label} {r.parts?.[k] ?? 0}</td>) : null}
                <td className="py-1.5 text-right font-semibold tabular-nums">{valueLabel(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.label} className="relative grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className="truncate text-slate-600" title={r.label}>{r.label}</span>
              <span className="flex h-3.5 items-center gap-[2px]">
                {(segments ?? [null]).map((k) => {
                  const v = k ? (r.parts?.[k] ?? 0) : r.value;
                  if (!v) return null;
                  return <span key={k ?? 'v'} className={cx('h-full transition-opacity last:rounded-r', hover !== null && hover !== i && 'opacity-45')}
                    style={{ width: `${(v / max) * 100}%`, background: k ? SERIES[k].color : SINGLE }} />;
                })}
              </span>
              <span className="text-right font-semibold tabular-nums text-slate-800">{valueLabel(r)}</span>
              {hover === i && r.tooltip && (
                <div className="pointer-events-none absolute left-40 top-0 z-10 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg">{r.tooltip}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
