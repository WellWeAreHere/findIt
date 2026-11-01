import { json, parse, readJson, route } from '@/lib/http';
import { idParam, matchReviewSchema } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as matchingService from '@/lib/services/matchingService';

export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const { id } = parse(idParam, params);
  const { match_status } = parse(matchReviewSchema, await readJson(request));
  return json({ match: await matchingService.review(admin, id, match_status) });
});
