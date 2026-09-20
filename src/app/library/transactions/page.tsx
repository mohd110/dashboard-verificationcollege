'use client';

import { useState, useTransition, useEffect } from 'react';
import { ArrowLeftRight, Search, AlertTriangle } from 'lucide-react';
import { getTransactions } from '@/actions/library/transactions';
import { formatDate } from '@/lib/library/format';

type Txn = {
  id: string; action: string; issued_at: string;
  due_date: string | null; returned_at: string | null; created_at: string;
  books: { title?: string; book_code?: string; author?: string } | null;
  people: { full_name?: string; student_id?: string; department?: string } | null;
  actors: { full_name?: string } | null;
};

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'issued' | 'returned'>('all');
  const [studentQuery, setStudentQuery] = useState('');
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function load(f: typeof filter, q: string) {
    setError('');
    startTransition(async () => {
      try {
        const r = await getTransactions({ limit: 100, action: f, studentQuery: q });
        setTxns(r as Txn[]);
        setLoaded(true);
      } catch {
        setError('Could not load transactions.');
      }
    });
  }

  useEffect(() => {
    if (!loaded && !isPending) {
      load('all', '');
    }
  }, [loaded, isPending]);

  const now = new Date();

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Transactions</h1>
        <p className="lib-page-sub">Complete history of all library book transactions.</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
              <Search size={15} />
              <input className="form-input" placeholder="Search by student name or ID…" value={studentQuery}
                onChange={e => { setStudentQuery(e.target.value); load(filter, e.target.value); }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['all', 'issued', 'returned'] as const).map(f => (
                <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setFilter(f); load(f, studentQuery); }} style={{ textTransform: 'capitalize' }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert--danger"><AlertTriangle size={14} /><span>{error}</span></div>}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{isPending ? 'Loading…' : `${txns.length} transaction${txns.length !== 1 ? 's' : ''}`}</h3>
        </div>
        {isPending ? (
          <div style={{ padding: 20 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                {[3, 2, 1, 1, 1, 1].map((w, j) => (
                  <div key={j} className="skeleton" style={{ flex: w, height: 14, borderRadius: 4 }} />
                ))}
              </div>
            ))}
          </div>
        ) : txns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><ArrowLeftRight size={20} /></div>
            <p className="empty-state__title">No transactions found</p>
            <p className="empty-state__sub">No transactions match your current filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Action</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Returned</th>
                  <th>Librarian</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => {
                  const isOverdue = !t.returned_at && t.due_date && new Date(t.due_date) < now;
                  return (
                    <tr key={t.id}>
                      <td>
                        <p className="cell-primary">{t.people?.full_name ?? '—'}</p>
                        <p className="cell-secondary">{t.people?.student_id}</p>
                      </td>
                      <td>
                        <p className="cell-primary">{t.books?.title ?? '—'}</p>
                        <p className="cell-secondary">{t.books?.book_code}</p>
                      </td>
                      <td>
                        <span className={`badge badge--${t.returned_at ? 'neutral' : 'info'}`} style={{ textTransform: 'capitalize' }}>
                          {t.action}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                        {formatDate(t.issued_at)}
                      </td>
                      <td style={{ fontSize: 12, color: isOverdue ? 'var(--danger)' : 'var(--gray-500)', fontWeight: isOverdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {formatDate(t.due_date)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                        {formatDate(t.returned_at)}
                      </td>
                      <td style={{ fontSize: 13 }}>{t.actors?.full_name ?? 'Neha'}</td>
                      <td>
                        {isOverdue
                          ? <span className="badge badge--overdue">Overdue</span>
                          : t.returned_at
                            ? <span className="badge badge--success">Returned</span>
                            : <span className="badge badge--info">Active</span>
                        }
                      </td>
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
