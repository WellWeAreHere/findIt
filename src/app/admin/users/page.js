'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { useSession } from '@/components/SessionProvider';
import { Alert, Badge, Button, Input, LoadError, Skeleton } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { api, toQuery, useApi } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';

export default function AdminUsersPage() {
  const { user: me } = useSession();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useApi(`/api/admin/users${toQuery({ search: query })}`);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  async function update(u, changes) {
    setBusy(u.user_id);
    setActionError(null);
    try {
      await api(`/api/admin/users/${u.user_id}`, { method: 'PATCH', body: changes });
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Users" subtitle="Deactivated accounts lose access immediately: every request re-checks the account in MySQL.">
      <div className="relative mb-6 max-w-md">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email or SRN" className="pl-10" aria-label="Search users" />
      </div>
      {actionError && <Alert type="error" className="mb-4">{actionError.message}</Alert>}
      {error ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 text-right font-medium">Reports</th>
                <th className="px-3 py-3 text-right font-medium">Claims</th>
                <th className="px-3 py-3 text-right font-medium">Rejected</th>
                <th className="px-3 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <tr key={u.user_id} className={u.is_active ? '' : 'bg-slate-50 text-slate-400'}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{u.name}{u.user_id === me?.user_id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}</p>
                    <p className="text-xs text-slate-500">{u.email}{u.srn && ` · ${u.srn}`}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <Badge tone={u.role === 'ADMIN' ? 'brand' : 'slate'}>{u.role === 'ADMIN' ? 'Admin' : 'Student'}</Badge>
                      {!u.is_active && <Badge tone="rose">Inactive</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.report_count}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.claim_count}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.rejected_claims > 0 ? <span className="font-semibold text-rose-600">{u.rejected_claims}</span> : 0}</td>
                  <td className="px-3 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                  <td className="px-5 py-3">
                    {u.user_id !== me?.user_id && (
                      <div className="flex justify-end gap-1.5">
                        {u.srn && (
                          <Button size="sm" variant="ghost" disabled={busy === u.user_id}
                            onClick={() => update(u, { role: u.role === 'ADMIN' ? 'STUDENT' : 'ADMIN' })}>
                            {u.role === 'ADMIN' ? 'Make student' : 'Make admin'}
                          </Button>
                        )}
                        <Button size="sm" variant={u.is_active ? 'dangerGhost' : 'secondary'} loading={busy === u.user_id}
                          onClick={() => update(u, { is_active: !u.is_active })}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No users match “{query}”.</p>}
        </div>
      )}
    </AdminShell>
  );
}
