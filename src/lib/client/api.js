'use client';
// Browser-side helpers for calling the FindIt API.
import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const init = { method, signal, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong', data?.fields);
  return data;
}

// Fetches `path` (or nothing when path is null) and exposes reload().
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const controller = useRef(null);

  const load = useCallback(async () => {
    if (!path) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { signal: controller.current.signal });
      setState({ data, error: null, loading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function toQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
