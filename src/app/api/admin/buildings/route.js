import { json, parse, readJson, route } from '@/lib/http';
import { buildingSchema } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as catalogService from '@/lib/services/catalogService';

export const POST = route(async (request) => {
  await requireAdmin();
  const id = await catalogService.addBuilding(parse(buildingSchema, await readJson(request)));
  return json({ id }, 201);
});
