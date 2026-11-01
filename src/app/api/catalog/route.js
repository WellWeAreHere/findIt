import { json, route } from '@/lib/http';
import { getCatalog } from '@/lib/services/catalogService';

export const GET = route(async () => json(await getCatalog()));
