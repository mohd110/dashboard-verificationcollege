import { Card, SkeletonHeading, SkeletonTable } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <Card title="Students">
        <SkeletonTable rows={9} columns={6} />
      </Card>
    </>
  );
}
