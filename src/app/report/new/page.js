'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ReportForm from '@/components/ReportForm';
import { PageHeader } from '@/components/ui';

function NewReport() {
  const type = useSearchParams().get('type') === 'FOUND' ? 'FOUND' : 'LOST';
  return <ReportForm mode="create" initialType={type} />;
}

export default function NewReportPage() {
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader eyebrow="New report" title="Report an item"
        subtitle="The more detail you give, the better FindIt can match it." />
      <div className="mt-8"><Suspense><NewReport /></Suspense></div>
    </div>
  );
}
