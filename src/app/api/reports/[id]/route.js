import { json, parse, readJson, route } from '@/lib/http';
import { idParam, reportUpdateSchema } from '@/lib/validation/schemas';
import { getCurrentUser, requireUser } from '@/lib/auth/guards';
import * as reportService from '@/lib/services/reportService';

export const GET = route(async (_request, params) => {
  const { id } = parse(idParam, params);
  return json(await reportService.detail(await getCurrentUser(), id));
});

export const PATCH = route(async (request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  const input = parse(reportUpdateSchema, await readJson(request));
  return json(await reportService.update(user, id, input));
});

export const DELETE = route(async (_request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  await reportService.remove(user, id);
  return json({ ok: true });
});
