import { json, route } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/guards';
import * as syncService from '@/lib/services/syncService';

export const GET = route(async () => {
  await requireAdmin();
  return json(await syncService.status());
});

export const POST = route(async () => {
  await requireAdmin();
  return json(await syncService.reconcile());
});
