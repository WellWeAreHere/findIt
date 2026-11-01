// Categories, item types, buildings and locations.
import { query, queryOne } from '../db/mysql.js';

export const listCategoriesWithItems = () => query(
  `SELECT c.category_id, c.category_name, c.description, i.item_id, i.item_name
   FROM categories c LEFT JOIN items i ON i.category_id = c.category_id
   ORDER BY c.category_name, i.item_name`,
);

export const listBuildingsWithLocations = () => query(
  `SELECT b.building_id, b.building_name, b.zone, l.location_id, l.floor, l.area
   FROM buildings b LEFT JOIN locations l ON l.building_id = b.building_id
   ORDER BY b.building_name, l.floor, l.area`,
);

export const findItem = (itemId) => queryOne(
  `SELECT i.item_id, i.item_name, c.category_id, c.category_name
   FROM items i JOIN categories c ON c.category_id = i.category_id WHERE i.item_id = ?`,
  [itemId],
);

export const findLocation = (locationId) => queryOne(
  `SELECT l.location_id, l.floor, l.area, b.building_id, b.building_name, b.zone
   FROM locations l JOIN buildings b ON b.building_id = l.building_id WHERE l.location_id = ?`,
  [locationId],
);

export async function insertBuilding({ building_name, zone }) {
  return (await query('INSERT INTO buildings (building_name, zone) VALUES (?, ?)', [building_name, zone])).insertId;
}

export async function insertLocation({ building_id, floor, area }) {
  return (await query('INSERT INTO locations (building_id, floor, area) VALUES (?, ?, ?)', [building_id, floor, area])).insertId;
}

export async function deleteLocation(locationId) {
  return (await query('DELETE FROM locations WHERE location_id = ?', [locationId])).affectedRows;
}

export async function insertCategory({ category_name, description }) {
  return (await query('INSERT INTO categories (category_name, description) VALUES (?, ?)', [category_name, description ?? null])).insertId;
}

export async function insertItem({ category_id, item_name }) {
  return (await query('INSERT INTO items (category_id, item_name) VALUES (?, ?)', [category_id, item_name])).insertId;
}

export async function deleteItem(itemId) {
  return (await query('DELETE FROM items WHERE item_id = ?', [itemId])).affectedRows;
}
