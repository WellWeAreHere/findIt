'use client';
import { useParams } from 'next/navigation';
import ReportForm from '@/components/ReportForm';
import { Alert, LoadError, PageHeader, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/client/api';

export default function EditReportPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/reports/${id}`);

  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader eyebrow="Edit report" title="Update your report" subtitle="Saving re-runs matching with the new details." />
      <div className="mt-8">
        {loading ? <Skeleton className="h-96" />
          : error ? <LoadError error={error} onRetry={reload} />
          : !data.isOwner ? <Alert type="error">You can only edit your own reports.</Alert>
          : data.report.status !== 'OPEN' ? <Alert type="info">This report is {data.report.status.toLowerCase()} and can no longer be edited.</Alert>
          : <ReportForm mode="edit" existing={data} />}
      </div>
    </div>
  );
}
