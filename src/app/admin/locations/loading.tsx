import { Card, SkeletonCard, SkeletonHeading, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
        <Card title="Locations">
          <SkeletonTable rows={4} columns={6} />
        </Card>
        <Card title="Add a location">
          <SkeletonCard lines={3} />
        </Card>
      </div>
    </>
  );
}
