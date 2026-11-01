import { json, route } from '@/lib/http';
import * as reportService from '@/lib/services/reportService';

export const GET = route(async () => json({ items: await reportService.recent(8) }));
