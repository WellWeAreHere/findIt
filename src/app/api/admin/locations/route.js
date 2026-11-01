import { json, parse, readJson, route } from '@/lib/http';
import { locationSchema } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as catalogService from '@/lib/services/catalogService';

export const POST = route(async (request) => {
  await requireAdmin();
  const id = await catalogService.addLocation(parse(locationSchema, await readJson(request)));
  return json({ id }, 201);
});
