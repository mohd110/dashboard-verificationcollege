import { Card, SkeletonCard, SkeletonHeading, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <div className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:items-start">
        <Card title="Accounts">
          <SkeletonTable rows={6} columns={6} />
        </Card>
        <Card title="Add a staff account">
          <SkeletonCard lines={5} />
        </Card>
      </div>
    </>
  );
}
