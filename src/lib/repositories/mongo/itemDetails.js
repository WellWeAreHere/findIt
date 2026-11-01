// item_details collection: flexible item descriptions, characteristics,
// search metadata and image metadata, keyed by MySQL report_id.
import { collection } from '../../db/mongo.js';

const col = () => collection('item_details');

// Idempotent upsert keyed by report_id (safe to retry from the outbox).
export async function upsert(doc) {
  const { created_at, ...rest } = doc;
  await (await col()).updateOne(
    { report_id: doc.report_id },
    { $set: { ...rest, updated_at: new Date() }, $setOnInsert: { created_at: created_at ?? new Date(), images: [] } },
    { upsert: true },
  );
}

export async function remove(reportId) {
  return (await (await col()).deleteOne({ report_id: reportId })).deletedCount;
}

export async function findOne(reportId) {
  return (await col()).findOne({ report_id: reportId }, { projection: { _id: 0 } });
}

export async function findMany(reportIds, projection = { _id: 0 }) {
  if (!reportIds.length) return [];
  return (await col()).find({ report_id: { $in: reportIds } }, { projection }).toArray();
}

// Weighted full-text search over the text index. User input only ever
// reaches the $search string, never an operator or a field name.
export async function textSearch(text, { reportType, limit = 200 } = {}) {
  const filter = { $text: { $search: String(text) } };
  if (reportType) filter.report_type = reportType;
  return (await col())
    .find(filter, { projection: { _id: 0, report_id: 1, score: { $meta: 'textScore' } } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray();
}

export async function addImage(reportId, image) {
  const result = await (await col()).updateOne(
    { report_id: reportId, 'images.2': { $exists: false } }, // at most 3 images
    { $push: { images: image }, $set: { updated_at: new Date() } },
  );
  return result.modifiedCount;
}

export async function removeImage(reportId, file) {
  return (await (await col()).updateOne({ report_id: reportId }, { $pull: { images: { file } } })).modifiedCount;
}

export async function allReportIds() {
  return (await (await col()).find({}, { projection: { _id: 0, report_id: 1 } }).toArray()).map((d) => d.report_id);
}

// ------------------------------------------------------------ aggregations

export async function monthlyTrend(months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months + 1, 1);
  since.setHours(0, 0, 0, 0);
  return (await col()).aggregate([
    { $match: { report_date: { $gte: since } } },
    { $group: {
      _id: { month: { $dateToString: { format: '%Y-%m', date: '$report_date' } }, type: '$report_type' },
      count: { $sum: 1 },
    } },
    { $group: { _id: '$_id.month', counts: { $push: { k: '$_id.type', v: '$count' } } } },
    { $project: { _id: 0, month: '$_id', counts: { $arrayToObject: '$counts' } } },
    { $sort: { month: 1 } },
  ]).toArray();
}

export async function lostByCategory() {
  return (await col()).aggregate([
    { $match: { report_type: 'LOST' } },
    { $group: { _id: '$category_name', lost: { $sum: 1 } } },
    { $sort: { lost: -1, _id: 1 } },
    { $project: { _id: 0, category: '$_id', lost: 1 } },
  ]).toArray();
}

export async function reportsByBuilding() {
  return (await col()).aggregate([
    { $group: { _id: { building: '$building_name', type: '$report_type' }, n: { $sum: 1 } } },
    { $group: { _id: '$_id.building', total: { $sum: '$n' }, split: { $push: { k: '$_id.type', v: '$n' } } } },
    { $project: { _id: 0, building: '$_id', total: 1, split: { $arrayToObject: '$split' } } },
    { $sort: { total: -1, building: 1 } },
    { $limit: 8 },
  ]).toArray();
}

// Most common values of one attribute across all characteristics,
// e.g. colours or brands - only possible because attributes are flexible.
export async function topAttributeValues(keys, limit = 6) {
  return (await col()).aggregate([
    { $project: { attrs: { $objectToArray: '$characteristics' } } },
    { $unwind: '$attrs' },
    { $match: { 'attrs.k': { $in: keys } } },
    { $group: { _id: { $toLower: { $toString: '$attrs.v' } }, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, value: '$_id', count: 1 } },
  ]).toArray();
}

export async function topTags(limit = 15) {
  return (await col()).aggregate([
    { $unwind: '$search_tags' },
    { $group: { _id: '$search_tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, tag: '$_id', count: 1 } },
  ]).toArray();
}
