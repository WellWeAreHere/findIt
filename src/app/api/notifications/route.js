import { json, parse, readJson, route, searchParams } from '@/lib/http';
import { markReadSchema } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import * as notificationService from '@/lib/services/notificationService';

export const GET = route(async (request) => {
  const user = await requireUser();
  const unreadOnly = searchParams(request).unread === 'true';
  return json(await notificationService.inbox(user.user_id, { unreadOnly, limit: 50 }));
});

export const PATCH = route(async (request) => {
  const user = await requireUser();
  return json(await notificationService.markRead(user.user_id, parse(markReadSchema, await readJson(request))));
});
