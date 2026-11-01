import { z } from 'zod';
import { json, parse, route, searchParams } from '@/lib/http';
import { requireUser } from '@/lib/auth/guards';
import * as reportService from '@/lib/services/reportService';

const schema = z.object({ type: z.enum(['LOST', 'FOUND']).optional(), status: z.enum(['OPEN', 'RESOLVED', 'CLOSED']).optional() });

export const GET = route(async (request) => {
  const user = await requireUser();
  const { type, status } = parse(schema, searchParams(request));
  const rows = await reportService.myReports(user.user_id);
  return json({ items: rows.filter((r) => (!type || r.report_type === type) && (!status || r.status === status)) });
});
