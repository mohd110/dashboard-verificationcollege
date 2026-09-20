import { Suspense } from 'react';
import { Bell, CheckCircle, Clock, AlertTriangle, Mail } from 'lucide-react';
import { getNotifications, getNotificationStats } from '@/actions/notifications';
import { formatDateTime } from '@/lib/library/format';
import { one, type NotificationRow } from '@/lib/library/rows';

async function NotificationStats() {
  try {
    const stats = await getNotificationStats();
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total', value: stats.total, icon: Bell, color: 'blue' },
          { label: 'Sent', value: stats.sent, icon: CheckCircle, color: 'green' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'orange' },
          { label: 'Failed', value: stats.failed, icon: AlertTriangle, color: 'red' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-card__icon stat-card__icon--${s.color}`}><s.icon size={16} /></div>
            <p className="stat-card__value">{s.value}</p>
            <p className="stat-card__label">{s.label}</p>
          </div>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}

async function NotificationTable() {
  try {
    const notifications = await getNotifications(100);

    if (!notifications.length) {
      return (
        <div className="empty-state">
          <div className="empty-state__icon"><Bell size={20} /></div>
          <p className="empty-state__title">No notifications yet</p>
          <p className="empty-state__sub">Notifications are created when books are issued.</p>
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="lib-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Type</th>
              <th>Channel</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Sent At</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n: NotificationRow) => {
              const person = one(n.people);
              return (
                <tr key={n.id}>
                  <td>
                    <p className="cell-primary">{person?.full_name ?? '—'}</p>
                    <p className="cell-secondary">{person?.student_id}</p>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>
                      {n.type}
                    </code>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <Mail size={12} />{n.channel}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray-500)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.recipient_email ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray-600)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.subject ?? '—'}
                  </td>
                  <td>
                    <span className={`badge badge--${n.status === 'SENT' ? 'success' : n.status === 'FAILED' ? 'danger' : 'warning'}`}>
                      {n.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(n.sent_at)}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--danger)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.error ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } catch {
    return (
      <div className="alert alert--danger">
        <AlertTriangle size={14} /><span>Could not load notifications.</span>
      </div>
    );
  }
}

export default function NotificationsPage() {
  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Notifications</h1>
        <p className="lib-page-sub">Email notification log for all library transactions.</p>
      </div>

      <Suspense fallback={null}>
        <NotificationStats />
      </Suspense>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Notification Log</h3>
        </div>
        <Suspense fallback={
          <div style={{ padding: 20 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                {[2, 1, 1, 2, 3, 1, 1].map((w, j) => (
                  <div key={j} className="skeleton" style={{ flex: w, height: 14, borderRadius: 4 }} />
                ))}
              </div>
            ))}
          </div>
        }>
          <NotificationTable />
        </Suspense>
      </div>
    </div>
  );
}
