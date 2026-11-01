// Catalogue: categories/items/buildings/locations (MySQL) joined with the
// per-category characteristic templates (MongoDB).
import * as catalog from '../repositories/catalog.js';
import * as templates from '../repositories/mongo/templates.js';
import { badRequest, notFound } from '../errors.js';

function groupBy(rows, key, makeGroup, childKey, makeChild) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], { ...makeGroup(row), [childKey]: [] });
    if (row[childKey.replace(/s$/, '_id')] !== null) groups.get(row[key])[childKey].push(makeChild(row));
  }
  return [...groups.values()];
}

export async function getCatalog() {
  const [categoryRows, buildingRows, templateDocs] = await Promise.all([
    catalog.listCategoriesWithItems(),
    catalog.listBuildingsWithLocations(),
    templates.all(),
  ]);
  const fieldsByCategory = new Map(templateDocs.map((t) => [t.category_id, t.fields]));
  const categories = groupBy(categoryRows, 'category_id',
    (r) => ({ category_id: r.category_id, category_name: r.category_name, description: r.description, fields: fieldsByCategory.get(r.category_id) ?? [] }),
    'items', (r) => ({ item_id: r.item_id, item_name: r.item_name }));
  const buildings = groupBy(buildingRows, 'building_id',
    (r) => ({ building_id: r.building_id, building_name: r.building_name, zone: r.zone }),
    'locations', (r) => ({ location_id: r.location_id, floor: r.floor, area: r.area }));
  return { categories, buildings };
}

export async function resolveItem(itemId) {
  const item = await catalog.findItem(itemId);
  if (!item) throw badRequest('Choose a valid item type', { item_id: 'Unknown item type' });
  return item;
}

export async function resolveLocation(locationId, field = 'location_id') {
  const location = await catalog.findLocation(locationId);
  if (!location) throw badRequest('Choose a valid location', { [field]: 'Unknown location' });
  return location;
}

// Validates characteristics against the category template: unknown keys
// are rejected (so arbitrary keys never reach MongoDB), select values must
// be one of the options, numbers are coerced, empty values are dropped.
export async function sanitizeCharacteristics(categoryId, input = {}) {
  const template = await templates.forCategory(categoryId);
  const fields = new Map((template?.fields ?? []).map((f) => [f.key, f]));
  const clean = {};
  const errors = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = fields.get(key);
    if (!field) {
      errors[`characteristics.${key}`] = 'Not a characteristic of this category';
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === '' || value === null || value === undefined) continue;
    if (field.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 10000) errors[`characteristics.${key}`] = `${field.label} must be a number`;
      else clean[key] = n;
    } else if (field.type === 'select' && field.options?.length) {
      const option = field.options.find((o) => o.toLowerCase() === String(value).toLowerCase());
      if (!option) errors[`characteristics.${key}`] = `Choose one of: ${field.options.join(', ')}`;
      else clean[key] = option;
    } else {
      clean[key] = String(value);
    }
  }
  for (const field of fields.values()) {
    if (field.required && !(field.key in clean)) errors[`characteristics.${field.key}`] = `${field.label} is required`;
  }
  if (Object.keys(errors).length) throw badRequest('Please check the item characteristics', errors);
  return clean;
}

// ------------------------------------------------------------ admin edits

export const addBuilding = (data) => catalog.insertBuilding(data);
export const addLocation = (data) => catalog.insertLocation(data);
export const addCategory = (data) => catalog.insertCategory(data);
export const addItem = (data) => catalog.insertItem(data);

export async function removeLocation(locationId) {
  if (!(await catalog.deleteLocation(locationId))) throw notFound('Location not found');
}

export async function removeItem(itemId) {
  if (!(await catalog.deleteItem(itemId))) throw notFound('Item type not found');
}

export async function saveTemplate(categoryId, fields) {
  const { categories } = await getCatalog();
  const category = categories.find((c) => c.category_id === categoryId);
  if (!category) throw notFound('Category not found');
  const keys = fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) throw badRequest('Field keys must be unique');
  await templates.upsert(categoryId, category.category_name, fields);
}
