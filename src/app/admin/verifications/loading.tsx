import { Card, Skeleton, SkeletonHeading, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <Card title="Filters">
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-9 w-full" />
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-6">
        <Card title="Events">
          <SkeletonTable rows={8} columns={7} />
        </Card>
      </div>
    </>
  );
}
