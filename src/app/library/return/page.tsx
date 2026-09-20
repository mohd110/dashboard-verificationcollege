'use client';

import { useState, useTransition } from 'react';
import {
  BookOpen, CheckCircle, AlertTriangle, Loader2, CornerDownLeft, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import CardScanner from '@/components/library/CardScanner';
import type { ScannedStudent } from '@/actions/library/scan-state';
import { getStudentLibraryProfile } from '@/actions/library/students';
import { returnBook } from '@/actions/library/books';
import { formatDate } from '@/lib/library/format';

type ActiveTxn = { id: string; issued_at: string; due_date: string | null; books: { title: string; book_code: string } | null };

export default function ReturnBookPage() {
  const [selectedStudent, setSelectedStudent] = useState<ScannedStudent | null>(null);
  const [signatureChecked, setSignatureChecked] = useState(false);
  const [activeBooks, setActiveBooks] = useState<ActiveTxn[]>([]);
  const [confirmTxn, setConfirmTxn] = useState<ActiveTxn | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // A returned book is still a transaction against a named student, so the
  // desk identifies them the same way the issue desk does.
  function selectStudent(s: ScannedStudent, checked: boolean) {
    setSelectedStudent(s);
    setSignatureChecked(checked);
    setError('');
    setSuccessMsg('');
    startTransition(async () => {
      try {
        const profile = await getStudentLibraryProfile(s.id);
        setActiveBooks(profile.activeTransactions as unknown as ActiveTxn[]);
      } catch {
        setError('Could not load the books issued to this student.');
      }
    });
  }

  function scanAnother() {
    setSelectedStudent(null);
    setSignatureChecked(false);
    setActiveBooks([]);
    setConfirmTxn(null);
    setError('');
  }

  function handleReturn(txn: ActiveTxn) {
    setError('');
    setConfirmTxn(txn);
  }

  function confirmReturn() {
    if (!confirmTxn || !selectedStudent) return;
    startTransition(async () => {
      try {
        const r = await returnBook({ transactionId: confirmTxn.id });
        setSuccessMsg(`${r.bookTitle} has been returned by ${r.studentName}.`);
        setConfirmTxn(null);
        setActiveBooks(prev => prev.filter(t => t.id !== confirmTxn.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Return failed.');
        setConfirmTxn(null);
      }
    });
  }

  const now = new Date();

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Return Book</h1>
        <p className="lib-page-sub">Scan the student&rsquo;s card, then select the book to return.</p>
      </div>

      <div style={{ maxWidth: 640 }}>
        {successMsg && (
          <div className="alert alert--success" style={{ marginBottom: 16 }}>
            <CheckCircle size={14} /><span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="alert alert--danger" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} /><span>{error}</span>
          </div>
        )}

        {/* Identify the student by their card, never from a list */}
        {!selectedStudent ? (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><h3 className="card-title">Identify Student</h3></div>
            <div className="card-body">
              <CardScanner onIdentified={selectStudent} />
            </div>
          </div>
        ) : (
          <div
            style={{
              marginBottom: 20, padding: '12px 14px', borderRadius: 10,
              background: signatureChecked ? 'var(--success-bg)' : 'var(--warning-bg)',
              border: '1px solid ' + (signatureChecked ? 'var(--success-border)' : 'var(--warning-border)'),
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            {signatureChecked
              ? <ShieldCheck size={18} color="var(--success)" style={{ flexShrink: 0 }} />
              : <ShieldAlert size={18} color="var(--warning)" style={{ flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{selectedStudent.full_name}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>
                {selectedStudent.student_id}
                {' · '}
                {signatureChecked ? 'card signature checked' : 'found by number, no card checked'}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={scanAnother}>Scan another</button>
          </div>
        )}

        {/* Active Books */}
        {selectedStudent && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {isPending ? 'Loading books…' : `Active Books (${activeBooks.length})`}
              </h3>
            </div>
            {isPending ? (
              <div style={{ padding: 20 }}>
                {[1, 2].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : activeBooks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon"><BookOpen size={18} /></div>
                <p className="empty-state__title">No active books</p>
                <p className="empty-state__sub">This student has no books currently issued.</p>
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {activeBooks.map(txn => {
                  const book = txn.books;
                  const isOverdue = txn.due_date && new Date(txn.due_date) < now;
                  return (
                    <div key={txn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--gray-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: isOverdue ? 'var(--danger-bg)' : 'var(--brand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <BookOpen size={16} color={isOverdue ? 'var(--danger)' : 'var(--brand-600)'} />
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{book?.title ?? '—'}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
                            {book?.book_code} · Issued: {formatDate(txn.issued_at)}
                            {txn.due_date && ` · Due: ${formatDate(txn.due_date)}`}
                            {isOverdue && <span className="badge badge--overdue" style={{ marginLeft: 8 }}>Overdue</span>}
                          </p>
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleReturn(txn)}>
                        <CornerDownLeft size={13} /> Return
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmTxn && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Confirm Return</h2>
              <button onClick={() => setConfirmTxn(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--gray-600)' }}>
                Return <strong>{confirmTxn.books?.title}</strong> from <strong>{selectedStudent?.full_name}</strong>?
              </p>
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--gray-500)' }}>Student</span>
                  <span style={{ fontWeight: 600 }}>{selectedStudent?.full_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--gray-500)' }}>Book</span>
                  <span style={{ fontWeight: 600 }}>{confirmTxn.books?.title}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmTxn(null)} disabled={isPending}>Cancel</button>
              <button className="btn btn-success" onClick={confirmReturn} disabled={isPending}>
                {isPending ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                {isPending ? 'Processing…' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
