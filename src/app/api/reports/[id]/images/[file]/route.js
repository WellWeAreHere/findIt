import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import * as reportService from '@/lib/services/reportService';

export const DELETE = route(async (_request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, { id: params.id });
  await reportService.removeImage(user, id, String(params.file));
  return json({ ok: true });
});
