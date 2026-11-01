import { json, parse, readJson, route, searchParams } from '@/lib/http';
import { browseSchema, reportCreateSchema } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import * as reportService from '@/lib/services/reportService';

// Public browse/search.
export const GET = route(async (request) => {
  const filters = parse(browseSchema, searchParams(request));
  return json(await reportService.browse(filters));
});

export const POST = route(async (request) => {
  const user = await requireUser();
  const input = parse(reportCreateSchema, await readJson(request));
  return json(await reportService.create(user, input), 201);
});
