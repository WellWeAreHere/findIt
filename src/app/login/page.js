'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useSession } from '@/components/SessionProvider';
import { safeNext } from '@/lib/client/format';


function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser, refreshUnread } = useSession();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: form });
      setUser(user);
      refreshUnread();
      router.replace(safeNext(params.get('next'), user.role === 'ADMIN' ? '/admin' : '/dashboard'));
      router.refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert type="error">{error.message}</Alert>}
      <Field label="University email" htmlFor="email" error={error?.fields?.email}>
        <Input id="email" type="email" autoComplete="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@university.edu" />
      </Field>
      <Field label="Password" htmlFor="password" error={error?.fields?.password}>
        <Input id="password" type="password" autoComplete="current-password" required value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <Button type="submit" loading={busy} className="w-full">Log in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Log in to report items, track matches and claim what's yours."
      footer={<>New to FindIt? <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">Create an account</Link></>}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
