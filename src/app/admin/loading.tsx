import { Card, SkeletonHeading, SkeletonStats, SkeletonTable } from '@/components/ui';

/**
 * Shown the instant a navigation starts, before the server has answered.
 *
 * Next prefetches this boundary for every link in the sidebar, so moving
 * between screens paints the shape of the next one immediately rather than
 * leaving the previous page on screen while a query runs.
 */
export default function Loading() {
  return (
    <>
      <SkeletonHeading />
      <SkeletonStats />
      <div className="mt-6">
        <Card title="Loading">
          <SkeletonTable rows={6} columns={6} />
        </Card>
      </div>
    </>
  );
}
