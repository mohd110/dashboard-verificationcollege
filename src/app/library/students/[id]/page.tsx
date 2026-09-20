import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  User, BookOpen, Clock, CheckCircle, AlertTriangle,
  ArrowLeft, BookPlus, CornerDownLeft, ShieldAlert,
} from 'lucide-react';
import { getStudentLibraryProfile } from '@/actions/library/students';
import { formatDate } from '@/lib/library/format';
import { one, type TransactionRow } from '@/lib/library/rows';

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let profile: Awaited<ReturnType<typeof getStudentLibraryProfile>>;
  try {
    profile = await getStudentLibraryProfile(id);
  } catch {
    notFound();
  }

  const { person, verification, activeTransactions, history, stats } = profile;
  const now = new Date();

  return (
    <div className="lib-content">
      {/* Back */}
      <Link href="/library/students" className="btn btn-ghost btn-sm" style={{ marginBottom: 16, gap: 6 }}>
        <ArrowLeft size={14} /> Back to Students
      </Link>

      {/* Student Identity Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--brand-100)', color: 'var(--brand-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 20, flexShrink: 0,
            }}>
              {person.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
                {person.full_name}
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)' }}>
                Student ID: <strong>{person.student_id}</strong> &nbsp;·&nbsp; {person.department}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>{person.email}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/*
              A profile reached from a list is a register lookup. No card was
              presented and no signature was checked, so this must never read
              as a credential verdict.
            */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Register</p>
              <span className={`badge badge--${verification?.verified ? 'info' : 'danger'}`}>
                {verification?.verified ? 'ON REGISTER' : verification?.status ?? 'NOT FOUND'}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Account</p>
              <span className={`badge badge--${person.status === 'active' ? 'success' : 'warning'}`}>
                {person.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Library Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--orange"><BookOpen size={16} /></div>
          <p className="stat-card__value">{stats.activeBooks}</p>
          <p className="stat-card__label">Active Books</p>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--blue"><Clock size={16} /></div>
          <p className="stat-card__value">{stats.totalTransactions}</p>
          <p className="stat-card__label">Total Transactions</p>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--red"><AlertTriangle size={16} /></div>
          <p className="stat-card__value">{stats.overdueBooks}</p>
          <p className="stat-card__label">Overdue Books</p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Link href="/library/issue" className="btn btn-primary">
          <BookPlus size={15} /> Scan card to issue
        </Link>
        {activeTransactions.length > 0 && (
          <Link href="/library/return" className="btn btn-secondary">
            <CornerDownLeft size={15} /> Return Book
          </Link>
        )}
      </div>

      {/* What this page did and did not check */}
      {verification?.verified ? (
        <div className="alert alert--warning" style={{ marginBottom: 20 }}>
          <ShieldAlert size={15} />
          <span>
            This is a register lookup. <strong>No card signature was checked.</strong> Scan the
            student&rsquo;s card at the issue desk before handing over a book.
          </span>
        </div>
      ) : (
        <div className="alert alert--danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={15} />
          <span>
            This student is <strong>{verification?.status ?? 'not on the register'}</strong>.
            {verification?.reason ? ` ${verification.reason}` : ''}
          </span>
        </div>
      )}

      {/* Active Books */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">Current Books ({activeTransactions.length})</h3>
        </div>
        {activeTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><BookOpen size={18} /></div>
            <p className="empty-state__title">No active books</p>
            <p className="empty-state__sub">No books are currently issued to this student.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Book Code</th>
                  <th>Issued On</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeTransactions.map((t: TransactionRow) => {
                  const book = one(t.books);
                  const isOverdue = t.due_date && new Date(t.due_date) < now;
                  return (
                    <tr key={t.id}>
                      <td className="cell-primary">{book?.title ?? '—'}</td>
                      <td>
                        <code style={{ fontSize: 12, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>
                          {book?.book_code}
                        </code>
                      </td>
                      <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                        {formatDate(t.issued_at)}
                      </td>
                      <td style={{ fontWeight: isOverdue ? 700 : 400, color: isOverdue ? 'var(--danger)' : 'var(--gray-700)' }}>
                        {formatDate(t.due_date)}
                        {isOverdue && <span className="badge badge--overdue" style={{ marginLeft: 6 }}>Overdue</span>}
                      </td>
                      <td><span className="badge badge--info">Issued</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Transaction History</h3>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No history yet</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Action</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Returned</th>
                  <th>Librarian</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t: TransactionRow) => {
                  const book = one(t.books);
                  const actor = one(t.actors);
                  return (
                    <tr key={t.id}>
                      <td>
                        <p className="cell-primary">{book?.title ?? '—'}</p>
                        <p className="cell-secondary">{book?.book_code}</p>
                      </td>
                      <td>
                        <span className={`badge badge--${t.returned_at ? 'success' : 'info'}`} style={{ textTransform: 'capitalize' }}>
                          {t.returned_at ? 'Returned' : 'Issued'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {formatDate(t.issued_at)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {formatDate(t.due_date)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {formatDate(t.returned_at)}
                      </td>
                      <td style={{ fontSize: 13 }}>{actor?.full_name ?? 'Neha'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
