import { z } from 'zod';
import { json, parse, route, searchParams } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/guards';
import * as matchingService from '@/lib/services/matchingService';

const schema = z.object({
  status: z.enum(['SUGGESTED', 'CONFIRMED', 'DISMISSED']).optional(),
  minScore: z.coerce.number().min(0).max(100).default(0),
});

export const GET = route(async (request) => {
  await requireAdmin();
  return json({ items: await matchingService.adminList({ ...parse(schema, searchParams(request)), limit: 100 }) });
});

// Re-run matching for every open report (e.g. after changing templates).
export const POST = route(async () => {
  await requireAdmin();
  return json(await matchingService.rematchAll());
});
