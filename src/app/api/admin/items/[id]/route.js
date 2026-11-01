import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as catalogService from '@/lib/services/catalogService';

export const DELETE = route(async (_request, params) => {
  await requireAdmin();
  await catalogService.removeItem(parse(idParam, params).id);
  return json({ ok: true });
});
