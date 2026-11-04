'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useSession } from '@/components/SessionProvider';

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const [form, setForm] = useState({ name: '', email: '', srn: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError({ message: 'Passwords do not match', fields: { confirm: 'Passwords do not match' } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { confirm, ...body } = form;
      const { user } = await api('/api/auth/register', { method: 'POST', body });
      setUser(user);
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const fe = error?.fields ?? {};
  return (
    <AuthShell title="Create your account" subtitle="For students. Use your university email and SRN."
      footer={<>Already registered? <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(fe).length && <Alert type="error">{error.message}</Alert>}
        <Field label="Full name" htmlFor="name" error={fe.name}>
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} error={fe.name} />
        </Field>
        <Field label="University email" htmlFor="email" error={fe.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fe.email} placeholder="you@university.edu" />
        </Field>
        <Field label="SRN" htmlFor="srn" error={fe.srn} hint="Your student registration number, e.g. PES1UG23CS042">
          <Input id="srn" value={form.srn} onChange={set('srn')} error={fe.srn} className="uppercase" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={fe.password} hint="8+ characters, a letter and a digit">
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={fe.password} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={fe.confirm}>
            <Input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={fe.confirm} />
          </Field>
        </div>
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </AuthShell>
  );
}
