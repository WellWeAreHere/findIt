// Writes MongoDB documents for the seeded MySQL reports, then marks those
// reports SYNCED in MySQL - the same MySQL-first, upsert-by-report_id flow
// the application uses for new reports.
import { Int32 } from 'mongodb';
import { categories, buildings, reports, claims, studentId } from '../seed/data.js';
import { buildSearchTags, tokenize } from '../../src/lib/utils/text.js';

const categoryOfItem = new Map();
categories.forEach((c, i) => c.items.forEach((item) => categoryOfItem.set(item, { id: i + 1, name: c.name })));

const buildingOfLocation = new Map();
buildings.forEach(([name, , locs]) => locs.forEach(([key]) => buildingOfLocation.set(key, name)));

const at = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+05:30`);

export async function seedMongo(db, mysqlConn) {
  await db.collection('category_templates').deleteMany({});
  await db.collection('category_templates').insertMany(categories.map((c, i) => ({
    category_id: new Int32(i + 1),
    category_name: c.name,
    fields: c.fields,
    updated_at: new Date(),
  })));

  const details = reports.map(([type, , item, loc, date, , description, characteristics], i) => {
    const category = categoryOfItem.get(item);
    const searchTags = buildSearchTags({ itemName: item, categoryName: category.name, characteristics });
    return {
      report_id: new Int32(i + 1),
      report_type: type,
      item_name: item,
      category_id: new Int32(category.id),
      category_name: category.name,
      building_name: buildingOfLocation.get(loc),
      report_date: new Date(`${date}T00:00:00Z`),
      description,
      characteristics,
      search_tags: searchTags,
      tokens: tokenize(item, description, ...searchTags),
      images: [],
      embedding: null,
      schema_version: new Int32(1),
      created_at: at(date, 9 + (i % 10)),
      updated_at: at(date, 9 + (i % 10)),
    };
  });

  await db.collection('item_details').deleteMany({});
  await db.collection('item_details').insertMany(details);

  const activity = [];
  reports.forEach(([, student, , , date], i) => {
    activity.push({ report_id: new Int32(i + 1), event: 'CREATED', actor_id: new Int32(studentId(student)), at: at(date, 9 + (i % 10)) });
  });
  claims.forEach(([report, student], i) => {
    activity.push({
      report_id: new Int32(report), event: 'CLAIM_SUBMITTED', actor_id: new Int32(studentId(student)),
      at: at(reports[report - 1][4], 20), data: { claim_id: i + 1 },
    });
  });
  await db.collection('report_activity').deleteMany({});
  await db.collection('report_activity').insertMany(activity);

  const ids = details.map((d) => d.report_id.valueOf());
  await mysqlConn.query(
    `UPDATE reports SET mongo_sync_status = 'SYNCED', sync_attempts = 1 WHERE report_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );

  return { templates: categories.length, itemDetails: details.length, activity: activity.length };
}
