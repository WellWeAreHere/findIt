// category_templates: per-category characteristic fields and match weights.
import { Int32 } from 'mongodb';
import { collection } from '../../db/mongo.js';

const col = () => collection('category_templates');

export async function all() {
  return (await col()).find({}, { projection: { _id: 0 } }).sort({ category_id: 1 }).toArray();
}

export async function forCategory(categoryId) {
  return (await col()).findOne({ category_id: categoryId }, { projection: { _id: 0 } });
}

export async function forCategories(categoryIds) {
  return (await col()).find({ category_id: { $in: categoryIds } }, { projection: { _id: 0 } }).toArray();
}

export async function upsert(categoryId, categoryName, fields) {
  await (await col()).updateOne(
    { category_id: new Int32(categoryId) },
    { $set: { category_name: categoryName, fields, updated_at: new Date() } },
    { upsert: true },
  );
}
