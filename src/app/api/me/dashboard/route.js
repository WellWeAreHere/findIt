import { json, route } from '@/lib/http';
import { requireUser } from '@/lib/auth/guards';
import * as userService from '@/lib/services/userService';

export const GET = route(async () => json(await userService.dashboard(await requireUser())));
