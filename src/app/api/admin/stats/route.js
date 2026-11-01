import { z } from 'zod';
import { json, parse, route, searchParams } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/guards';
import * as analyticsService from '@/lib/services/analyticsService';

const schema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });

export const GET = route(async (request) => {
  await requireAdmin();
  const { from, to } = parse(schema, searchParams(request));
  if (from || to) {
    return json(await analyticsService.recoverySummary(from ?? '2020-01-01', to ?? new Date().toISOString().slice(0, 10)));
  }
  return json(await analyticsService.dashboard());
});
