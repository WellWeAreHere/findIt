import { json, route } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth/guards';

export const GET = route(async () => json({ user: await getCurrentUser() }));
