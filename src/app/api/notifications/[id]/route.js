import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import * as notificationService from '@/lib/services/notificationService';

export const DELETE = route(async (_request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  await notificationService.remove(user.user_id, id);
  return json({ ok: true });
});
