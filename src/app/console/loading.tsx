import { Card, Skeleton, SkeletonHeading, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:items-start">
        <Card title="Scan">
          <div className="space-y-3 px-5 py-5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Card>
        <Card title="Recent scans here">
          <SkeletonTable rows={6} columns={4} />
        </Card>
      </div>
    </>
  );
}
