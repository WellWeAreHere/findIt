// Creates FindIt's MongoDB collections with JSON-schema validators and
// indexes. Safe to re-run: existing collections get their validator
// updated via collMod, and createIndex is idempotent.

const ITEM_DETAILS_SCHEMA = {
  bsonType: 'object',
  required: ['report_id', 'report_type', 'item_name', 'category_id', 'description',
    'characteristics', 'search_tags', 'tokens', 'images', 'created_at'],
  properties: {
    report_id: { bsonType: ['int', 'long'], minimum: 1, description: 'MySQL reports.report_id' },
    report_type: { enum: ['LOST', 'FOUND'] },
    item_name: { bsonType: 'string' },
    category_id: { bsonType: ['int', 'long'] },
    category_name: { bsonType: 'string' },
    building_name: { bsonType: 'string' },
    report_date: { bsonType: 'date' },
    description: { bsonType: 'string', minLength: 10, maxLength: 2000 },
    characteristics: { bsonType: 'object' },
    search_tags: { bsonType: 'array', items: { bsonType: 'string' }, maxItems: 40 },
    tokens: { bsonType: 'array', items: { bsonType: 'string' } },
    images: {
      bsonType: 'array',
      maxItems: 3,
      items: {
        bsonType: 'object',
        required: ['file', 'mime', 'size'],
        properties: {
          file: { bsonType: 'string', pattern: '^[a-f0-9]{16,64}\\.(jpg|png|webp)$' },
          mime: { enum: ['image/jpeg', 'image/png', 'image/webp'] },
          size: { bsonType: ['int', 'long'], maximum: 5 * 1024 * 1024 },
        },
      },
    },
    embedding: { bsonType: ['array', 'null'] },
    schema_version: { bsonType: 'int' },
    created_at: { bsonType: 'date' },
    updated_at: { bsonType: 'date' },
  },
};

const CATEGORY_TEMPLATES_SCHEMA = {
  bsonType: 'object',
  required: ['category_id', 'category_name', 'fields'],
  properties: {
    category_id: { bsonType: ['int', 'long'] },
    category_name: { bsonType: 'string' },
    fields: {
      bsonType: 'array',
      minItems: 1,
      items: {
        bsonType: 'object',
        required: ['key', 'label', 'type', 'match_weight'],
        properties: {
          key: { bsonType: 'string', pattern: '^[a-z][a-z0-9_]{1,39}$' },
          label: { bsonType: 'string' },
          type: { enum: ['text', 'select', 'number'] },
          options: { bsonType: 'array', items: { bsonType: 'string' } },
          match_weight: { bsonType: ['int', 'double'], minimum: 0, maximum: 5 },
          required: { bsonType: 'bool' },
        },
      },
    },
  },
};

const REPORT_ACTIVITY_SCHEMA = {
  bsonType: 'object',
  required: ['report_id', 'event', 'at'],
  properties: {
    report_id: { bsonType: ['int', 'long'] },
    event: {
      enum: ['CREATED', 'EDITED', 'IMAGE_ADDED', 'VIEWED', 'MATCH_RUN', 'CLAIM_SUBMITTED',
        'CLAIM_DECIDED', 'STATUS_CHANGED', 'RESYNCED'],
    },
    actor_id: { bsonType: ['int', 'long', 'null'] },
    at: { bsonType: 'date' },
    data: { bsonType: 'object' },
  },
};

const COLLECTIONS = {
  item_details: ITEM_DETAILS_SCHEMA,
  category_templates: CATEGORY_TEMPLATES_SCHEMA,
  report_activity: REPORT_ACTIVITY_SCHEMA,
};

export async function initMongo(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  for (const [name, schema] of Object.entries(COLLECTIONS)) {
    const options = { validator: { $jsonSchema: schema }, validationLevel: 'strict', validationAction: 'error' };
    if (existing.has(name)) {
      await db.command({ collMod: name, ...options });
    } else {
      await db.createCollection(name, options);
    }
  }

  const items = db.collection('item_details');
  await items.createIndex({ report_id: 1 }, { unique: true, name: 'uq_report_id' });
  await items.createIndex(
    { search_tags: 'text', item_name: 'text', description: 'text' },
    { name: 'txt_item_search', weights: { search_tags: 10, item_name: 8, description: 4 }, default_language: 'english' },
  );
  await items.createIndex({ category_id: 1, report_type: 1, report_date: -1 }, { name: 'idx_category_type_date' });
  await items.createIndex({ 'characteristics.color': 1 }, { name: 'idx_char_color', sparse: true });

  await db.collection('category_templates').createIndex({ category_id: 1 }, { unique: true, name: 'uq_category_id' });
  await db.collection('report_activity').createIndex({ report_id: 1, at: -1 }, { name: 'idx_report_at' });
  await db.collection('report_activity').createIndex({ at: -1 }, { name: 'idx_recent' });
}
