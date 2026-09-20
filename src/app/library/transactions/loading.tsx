import PageSkeleton from '@/components/library/PageSkeleton';

export default function Loading() {
  return <PageSkeleton title="Transactions" stats={0} rows={8} />;
}
