// Text normalisation shared by the MongoDB seed, the report service and
// the matching engine, so stored tokens and query tokens always agree.

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'by', 'for', 'from', 'had', 'has', 'have', 'i', 'in', 'is', 'it',
  'its', 'left', 'lost', 'found', 'me', 'my', 'near', 'of', 'on', 'or', 'some', 'the', 'there', 'this',
  'to', 'was', 'were', 'while', 'with', 'after', 'around', 'inside', 'outside', 'during', 'about', 'one',
  'two', 'three', 'next', 'picked', 'up', 'please', 'small', 'probably', 'still', 'when', 'came',
]);

export function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Light plural stemming: boxes/watches/glasses -> box/watch/glass,
// bottles/keys -> bottle/key. Enough to make singular and plural agree.
export function stem(word) {
  if (word.length > 4 && /(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

export function tokenize(...texts) {
  const tokens = new Set();
  for (const text of texts) {
    for (const raw of normalize(text).split(/[\s-]+/)) {
      if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
      tokens.add(stem(raw));
    }
  }
  return [...tokens];
}

// Search tags: item name, category, and every characteristic value.
export function buildSearchTags({ itemName, categoryName, characteristics = {} }) {
  const tags = new Set([normalize(itemName), normalize(categoryName)]);
  for (const value of Object.values(characteristics)) {
    const parts = Array.isArray(value) ? value : String(value).split(',');
    for (const part of parts) {
      const tag = normalize(part);
      if (tag) tags.add(tag);
    }
  }
  tags.delete('');
  return [...tags];
}
