/**
 * The shape of a page, painted while its data is still in flight.
 *
 * Next prefetches the loading boundary for every sidebar link, so a tab change
 * shows the next screen's layout immediately instead of leaving the previous
 * one on screen while a query runs. It is the cheapest thing that can be done
 * for how the app feels.
 */
export default function PageSkeleton({
  title,
  stats = 0,
  rows = 6,
}: {
  title: string;
  /** Number of stat tiles this page opens with. */
  stats?: number;
  /** Number of table or list rows to sketch. */
  rows?: number;
}) {
  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">{title}</h1>
        <div className="skeleton" style={{ width: 260, height: 13, borderRadius: 4, marginTop: 8 }} />
      </div>

      {stats > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats}, 1fr)`, gap: 14, marginBottom: 20 }}>
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 8, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 88, height: 11, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ width: 170, height: 14, borderRadius: 4 }} />
        </div>
        <div style={{ padding: '4px 20px 16px' }}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--gray-100)' }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '42%', height: 13, borderRadius: 4, marginBottom: 7 }} />
                <div className="skeleton" style={{ width: '26%', height: 11, borderRadius: 4 }} />
              </div>
              <div className="skeleton" style={{ width: 72, height: 22, borderRadius: 999, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
