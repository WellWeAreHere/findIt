import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-slate-500">Ironic, for a lost &amp; found. Try browsing the items instead.</p>
      <div className="mt-6 flex gap-3">
        <Button href="/browse">Browse items</Button>
        <Button href="/" variant="secondary">Go home</Button>
      </div>
    </div>
  );
}
