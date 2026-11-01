import { json, parse, readJson, route } from '@/lib/http';
import { idParam, templateSchema } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as catalogService from '@/lib/services/catalogService';

export const PUT = route(async (request, params) => {
  await requireAdmin();
  const { id } = parse(idParam, params);
  const { fields } = parse(templateSchema, await readJson(request));
  await catalogService.saveTemplate(id, fields);
  return json({ ok: true });
});
