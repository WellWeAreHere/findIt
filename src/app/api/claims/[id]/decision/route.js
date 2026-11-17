import { json, parse, readJson, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import { badRequest } from '@/lib/errors';
import { decideByFinder } from '@/lib/services/claimService';

export const POST = route(async (request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  const { decision } = await readJson(request);
  if (!['approve', 'reject'].includes(decision)) throw badRequest('Choose approve or reject');
  await decideByFinder(user, id, decision);
  return json({ ok: true });
});
