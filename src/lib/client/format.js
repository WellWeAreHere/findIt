// Display helpers shared by the UI.

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const parse = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  // MySQL "YYYY-MM-DD HH:MM:SS" and "YYYY-MM-DD" (server local time)
  const s = String(value);
  return new Date(/^\d{4}-\d{2}-\d{2}( |$)/.test(s) ? s.replace(' ', 'T') : s);
};

export const formatDate = (v) => (parse(v) ? dateFmt.format(parse(v)) : '');
export const formatDateTime = (v) => (parse(v) ? dateTimeFmt.format(parse(v)) : '');

export function timeAgo(v) {
  const d = parse(v);
  if (!d) return '';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(d);
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function placeLabel({ building_name, area, floor }) {
  const floorLabel = floor === 0 ? 'Ground floor' : floor < 0 ? `Basement ${-floor}` : `Floor ${floor}`;
  return [building_name, area, area?.toLowerCase().includes('floor') ? null : floorLabel].filter(Boolean).join(' · ');
}

export const humanize = (key) => String(key).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Only same-site relative paths are allowed as a post-login destination.
export const safeNext = (next, fallback) => (next && next.startsWith('/') && !next.startsWith('//') ? next : fallback);
