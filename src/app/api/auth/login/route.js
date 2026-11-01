import { cookies, headers } from 'next/headers';
import { json, parse, readJson, route } from '@/lib/http';
import { loginSchema } from '@/lib/validation/schemas';
import * as authService from '@/lib/services/authService';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const POST = route(async (request) => {
  const input = parse(loginSchema, await readJson(request));
  const client = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const { user, token } = await authService.login(input, client);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return json({ user });
});
