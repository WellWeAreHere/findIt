// weighted-v1: transparent, explainable lost<->found scoring.
//
//   score = 100 x (0.35 description + 0.25 characteristics + 0.15 category
//                  + 0.15 location + 0.10 date)
//
// Category, location and date components are computed in MySQL
// (fn_category_similarity, fn_location_proximity, fn_date_proximity) and
// passed in; description and characteristics are computed here from the
// MongoDB documents. A future scorer (e.g. "semantic-v2" with embeddings)
// only has to implement the same score() contract.
import { normalize, tokenize } from '../utils/text.js';

export const WEIGHTS = { description: 0.35, characteristics: 0.25, category: 0.15, location: 0.15, date: 0.10 };
export const STORE_THRESHOLD = 40;   // matches below this are not stored
export const NOTIFY_THRESHOLD = 60;  // owners are notified at or above this

const round3 = (x) => Math.round(x * 1000) / 1000;

export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return { score: 0, shared: [] };
  const shared = [...setA].filter((t) => setB.has(t));
  return { score: shared.length / new Set([...setA, ...setB]).size, shared };
}

// Two attribute values agree if they are equal after normalisation, one
// contains the other ("navy blue" / "blue"), or most of the words of the
// shorter value appear in the longer ("red sticker" / "red guitar sticker").
export function valuesAgree(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) return true;
  const tx = tokenize(x);
  const ty = tokenize(y);
  if (!tx.length || !ty.length) return false;
  const shared = tx.filter((t) => ty.includes(t)).length;
  return shared / Math.min(tx.length, ty.length) >= 0.5;
}

// fields: template fields [{ key, label, match_weight }] for the category.
export function compareCharacteristics(a = {}, b = {}, fields = []) {
  const meta = new Map(fields.map((f) => [f.key, f]));
  let compared = 0;
  let agreed = 0;
  const matched = [];
  const differed = [];
  for (const key of Object.keys(a)) {
    if (!(key in b)) continue;
    if (String(a[key]).trim() === '' || String(b[key]).trim() === '') continue;
    const weight = meta.get(key)?.match_weight ?? 1;
    if (weight <= 0) continue;
    const label = meta.get(key)?.label ?? key.replace(/_/g, ' ');
    compared += weight;
    if (valuesAgree(a[key], b[key])) {
      agreed += weight;
      matched.push({ kind: 'attribute', label, value: String(b[key]) });
    } else {
      differed.push({ kind: 'difference', label, lost: String(a[key]), found: String(b[key]) });
    }
  }
  // Nothing comparable is neither evidence for nor against a match.
  return { score: compared ? agreed / compared : 0.5, matched, differed };
}

const CATEGORY_LABEL = { 1: 'Same item type', 0.6: 'Same category' };
const LOCATION_LABEL = { 1: 'Same spot', 0.8: 'Same building and floor', 0.6: 'Same building', 0.3: 'Same area of campus' };

function daysBetween(a, b) {
  return Math.round(Math.abs(new Date(a) - new Date(b)) / 86_400_000);
}

export const weightedV1 = {
  version: 'weighted-v1',

  // lost/found: { doc, report_date }; sql: { category, location, date } in [0,1]
  score({ lost, found, sql, fields }) {
    const description = jaccard(lost.doc.tokens ?? [], found.doc.tokens ?? []);
    const chars = compareCharacteristics(lost.doc.characteristics, found.doc.characteristics, fields);

    const components = {
      description: round3(description.score),
      characteristics: round3(chars.score),
      category: round3(sql.category),
      location: round3(sql.location),
      date: round3(sql.date),
    };
    const total = Math.round(100 * Object.entries(WEIGHTS)
      .reduce((sum, [k, w]) => sum + w * components[k], 0) * 100) / 100;

    const matched = [...chars.matched];
    if (CATEGORY_LABEL[components.category]) matched.push({ kind: 'category', label: CATEGORY_LABEL[components.category] });
    if (LOCATION_LABEL[components.location]) matched.push({ kind: 'location', label: LOCATION_LABEL[components.location] });
    if (components.date > 0) {
      const days = daysBetween(lost.report_date, found.report_date);
      matched.push({ kind: 'date', label: days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'} apart` });
    }
    if (description.shared.length) {
      matched.push({ kind: 'words', label: 'Shared words', value: description.shared.slice(0, 6).join(', ') });
    }
    return { components, total, matched: [...matched, ...chars.differed] };
  },
};

export const activeScorer = weightedV1;
