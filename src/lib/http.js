// Thin helpers for route handlers: JSON responses, body parsing and one
// place that turns thrown errors into consistent HTTP responses.
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, badRequest, fromDatabaseError } from './errors.js';

export const json = (data, status = 200) => NextResponse.json(data, { status });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
}

export function searchParams(request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw badRequest('Please check the highlighted fields', fields);
  }
  return result.data;
}

// Wraps a route handler: awaits Next's async params and maps errors.
export function route(handler) {
  return async (request, context) => {
    try {
      const params = context?.params ? await context.params : {};
      return await handler(request, params);
    } catch (err) {
      const appError = err instanceof AppError ? err
        : err instanceof ZodError ? badRequest('Invalid input')
        : fromDatabaseError(err);
      if (appError) {
        return json({ error: appError.message, ...(appError.details && { fields: appError.details }) }, appError.status);
      }
      console.error('[api]', request.method, new URL(request.url).pathname, err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}
