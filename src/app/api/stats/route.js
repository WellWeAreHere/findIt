import { json, route } from '@/lib/http';
import * as analytics from '@/lib/repositories/analytics';

// Public headline numbers for the landing page (no personal data).
export const GET = route(async () => {
  const t = await analytics.totals();
  return json({
    total_reports: Number(t.total_reports ?? 0),
    recoveries: Number(t.recoveries ?? 0),
    unresolved_reports: Number(t.unresolved_reports ?? 0),
  });
});
