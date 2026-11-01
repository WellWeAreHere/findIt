// Server-side input validation (zod). Every route parses its input with
// one of these before any database call.
import { z } from 'zod';

const id = z.coerce.number().int().positive();
const optionalId = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), id.optional());
const email = z.string({ error: 'Email is required' }).trim().toLowerCase().max(255)
  .pipe(z.email('Enter a valid email address'));
const isoDate = z.iso.date({ error: 'Use the format YYYY-MM-DD' });
const trimmed = (min, max, label) => z.string({ error: `${label} is required` }).trim()
  .min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`);

export const REPORT_TYPES = ['LOST', 'FOUND'];
export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'CLOSED'];

// ---------------------------------------------------------------- auth
export const registerSchema = z.object({
  name: trimmed(2, 100, 'Name'),
  email,
  srn: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,20}$/, 'SRN should be 6-20 letters and digits'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long')
    .regex(/[A-Za-z]/, 'Password needs a letter').regex(/[0-9]/, 'Password needs a digit'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

// ---------------------------------------------------------------- reports
// Characteristic keys are checked against the category template in the
// service; here we only bound their shape and size.
const characteristics = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Invalid characteristic'),
  z.union([z.string().trim().max(100), z.number().finite()]),
).default({}).refine((o) => Object.keys(o).length <= 15, 'Too many characteristics');

export const reportCreateSchema = z.object({
  report_type: z.enum(REPORT_TYPES, { error: 'Choose lost or found' }),
  item_id: id,
  location_id: id,
  custody_location_id: optionalId,
  report_date: isoDate,
  summary: trimmed(10, 255, 'Summary'),
  description: trimmed(10, 2000, 'Description'),
  characteristics,
}).refine((r) => r.report_type === 'FOUND' || !r.custody_location_id, {
  path: ['custody_location_id'], error: 'Only found items have a custody location',
});

export const reportUpdateSchema = z.object({
  item_id: id.optional(),
  location_id: id.optional(),
  custody_location_id: optionalId.nullable(),
  report_date: isoDate.optional(),
  summary: trimmed(10, 255, 'Summary').optional(),
  description: trimmed(10, 2000, 'Description').optional(),
  characteristics: characteristics.optional(),
});

export const browseSchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(REPORT_TYPES).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  category: optionalId,
  building: optionalId,
  location: optionalId,
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['newest', 'oldest', 'relevance']).default('newest'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

// ---------------------------------------------------------------- claims
export const claimCreateSchema = z.object({
  report_id: id,
  lost_report_id: optionalId,
  claim_description: trimmed(20, 2000, 'Proof of ownership'),
});

export const claimDecisionSchema = z.object({
  note: z.string().trim().max(255).optional(),
});

// ---------------------------------------------------------------- matches
export const matchReviewSchema = z.object({
  match_status: z.enum(['CONFIRMED', 'DISMISSED', 'SUGGESTED']),
});

// ---------------------------------------------------------------- notifications
export const markReadSchema = z.object({
  ids: z.array(id).max(200).optional(),
  all: z.boolean().optional(),
}).refine((b) => b.all || b.ids?.length, 'Provide ids or all: true');

// ---------------------------------------------------------------- admin
export const userUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  role: z.enum(['STUDENT', 'ADMIN']).optional(),
});

export const buildingSchema = z.object({
  building_name: trimmed(2, 80, 'Building name'),
  zone: z.enum(['ACADEMIC', 'HOSTEL', 'FOOD', 'SPORTS', 'ADMIN', 'OPEN_AREA']),
});

export const locationSchema = z.object({
  building_id: id,
  floor: z.coerce.number().int().min(-2).max(15).default(0),
  area: trimmed(2, 100, 'Area'),
});

export const categorySchema = z.object({
  category_name: trimmed(2, 60, 'Category name'),
  description: z.string().trim().max(255).optional(),
});

export const itemSchema = z.object({
  category_id: id,
  item_name: trimmed(2, 80, 'Item name'),
});

export const templateSchema = z.object({
  fields: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Keys use lowercase letters, digits and _'),
    label: trimmed(1, 60, 'Label'),
    type: z.enum(['text', 'select', 'number']),
    options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    match_weight: z.number().min(0).max(5),
    required: z.boolean().optional(),
  })).min(1).max(20),
});

export const idParam = z.object({ id });
