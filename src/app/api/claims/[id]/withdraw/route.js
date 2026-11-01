import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireStudent } from '@/lib/auth/guards';
import * as claimService from '@/lib/services/claimService';

export const POST = route(async (_request, params) => {
  const student = await requireStudent();
  const { id } = parse(idParam, params);
  await claimService.withdraw(student, id);
  return json({ ok: true });
});
