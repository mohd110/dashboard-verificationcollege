import { Card, Skeleton, SkeletonCard, SkeletonHeading } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="mb-6 flex justify-center rounded-xl border border-line bg-surface py-8">
        <Skeleton className="card-print rounded-[3mm]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="What is on this card">
          <SkeletonCard lines={5} />
        </Card>
        <Card title="Scan this from a screen">
          <div className="flex justify-center px-5 py-5">
            <Skeleton className="h-64 w-64" />
          </div>
        </Card>
      </div>
    </>
  );
}
