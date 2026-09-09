import { Card, SkeletonCard, SkeletonHeading } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="grid gap-6 lg:grid-cols-[21rem_1fr] lg:items-start">
        <div className="space-y-6">
          <Card title="Registration">
            <SkeletonCard lines={4} />
          </Card>
          <Card title="Identity">
            <SkeletonCard lines={3} />
          </Card>
        </div>
        <Card title="Activity Trail">
          <SkeletonCard lines={6} />
        </Card>
      </div>
    </>
  );
}
