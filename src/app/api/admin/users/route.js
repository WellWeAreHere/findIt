import { json, route, searchParams } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/guards';
import * as userService from '@/lib/services/userService';

export const GET = route(async (request) => {
  await requireAdmin();
  const search = searchParams(request).search?.trim().slice(0, 100) || undefined;
  return json({ items: await userService.list(search) });
});
