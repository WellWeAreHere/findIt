import { json, parse, readJson, route } from '@/lib/http';
import { idParam, userUpdateSchema } from '@/lib/validation/schemas';
import { requireAdmin } from '@/lib/auth/guards';
import * as userService from '@/lib/services/userService';

export const PATCH = route(async (request, params) => {
  const admin = await requireAdmin();
  const { id } = parse(idParam, params);
  return json({ user: await userService.update(admin, id, parse(userUpdateSchema, await readJson(request))) });
});
