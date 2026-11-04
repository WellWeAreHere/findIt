'use client';
// Holds the signed-in user (from /api/auth/me) and the unread
// notification count for the navigation bar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const { unread: n } = await api('/api/notifications?unread=true');
      setUnread(n);
    } catch { /* signed out or offline */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api('/api/auth/me');
      setUser(u);
      if (u) refreshUnread();
    } catch {
      setUser(null);
    }
  }, [refreshUnread]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll the unread count while signed in.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(refreshUnread, 60_000);
    return () => clearInterval(id);
  }, [user, refreshUnread]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setUnread(0);
  }, []);

  const value = useMemo(() => ({
    user, loading: user === undefined, setUser, refresh, logout, unread, setUnread, refreshUnread,
  }), [user, refresh, logout, unread, refreshUnread]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
