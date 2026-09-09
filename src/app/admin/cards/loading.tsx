import { Card, SkeletonHeading, SkeletonStats, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <SkeletonStats />
      <div className="mt-6">
        <Card title="Cards">
          <SkeletonTable rows={8} columns={7} />
        </Card>
      </div>
    </>
  );
}
