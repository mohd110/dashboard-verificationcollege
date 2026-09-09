import { Card, SkeletonCard, SkeletonHeading } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Record">
          <SkeletonCard lines={7} />
        </Card>
        <Card title="Integrity">
          <SkeletonCard lines={5} />
        </Card>
      </div>
    </>
  );
}
