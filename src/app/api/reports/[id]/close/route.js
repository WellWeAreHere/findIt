import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import * as reportService from '@/lib/services/reportService';

export const POST = route(async (_request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  await reportService.close(user, id);
  return json({ ok: true });
});
