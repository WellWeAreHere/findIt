import { cookies } from 'next/headers';
import { json, parse, readJson, route } from '@/lib/http';
import { registerSchema } from '@/lib/validation/schemas';
import * as authService from '@/lib/services/authService';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const POST = route(async (request) => {
  const input = parse(registerSchema, await readJson(request));
  const { user, token } = await authService.register(input);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return json({ user }, 201);
});
