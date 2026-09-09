import { Card, SkeletonCard, SkeletonHeading, SkeletonStats, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <SkeletonStats count={3} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Head of chain">
          <SkeletonCard lines={2} />
        </Card>
      </div>
      <div className="mt-6">
        <Card title="Most recent records">
          <SkeletonTable rows={6} columns={6} />
        </Card>
      </div>
    </>
  );
}
