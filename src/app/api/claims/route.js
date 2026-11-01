import { json, parse, readJson, route } from '@/lib/http';
import { claimCreateSchema } from '@/lib/validation/schemas';
import { requireStudent, requireUser } from '@/lib/auth/guards';
import * as claimService from '@/lib/services/claimService';

export const GET = route(async () => {
  const user = await requireUser();
  const [mine, incoming] = await Promise.all([claimService.mine(user.user_id), claimService.onMyFoundItems(user.user_id)]);
  return json({ mine, incoming });
});

export const POST = route(async (request) => {
  const student = await requireStudent();
  const input = parse(claimCreateSchema, await readJson(request));
  return json(await claimService.submit(student, input), 201);
});
