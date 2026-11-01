import { json, parse, route } from '@/lib/http';
import { claimDecisionSchema, idParam } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as claimService from '@/lib/services/claimService';

export const POST = route(async (request, params) => {
  const admin = await requireAdmin();
  const { id } = parse(idParam, params);
  const body = await request.json().catch(() => ({}));
  const { note } = parse(claimDecisionSchema, body ?? {});
  return json({ claim: await claimService.approve(admin, id, note) });
});
