import PageSkeleton from '@/components/library/PageSkeleton';

export default function Loading() {
  return <PageSkeleton title="Dashboard" stats={5} rows={5} />;
}
