import { json, route } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/guards';
import * as claimService from '@/lib/services/claimService';

export const GET = route(async () => {
  await requireAdmin();
  const [pending, decided] = await Promise.all([claimService.pendingQueue(), claimService.recentDecisions()]);
  return json({ pending, decided });
});
