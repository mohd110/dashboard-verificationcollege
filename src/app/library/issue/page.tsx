'use client';

import { useState, useTransition } from 'react';
import {
  Search, BookOpen, CheckCircle, AlertTriangle, Loader2, Calendar, ShieldAlert, ShieldCheck,
} from 'lucide-react';

import CardScanner from '@/components/library/CardScanner';
import type { ScannedStudent } from '@/actions/library/scan-state';
import { searchBooks, issueBook } from '@/actions/library/books';
import { formatDate } from '@/lib/library/format';

type Book = {
  id: string; book_code: string; title: string; author: string;
  available_copies: number; total_copies: number;
};

type Step = 1 | 2 | 3;

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: 'Scan Card' },
  { n: 2, label: 'Select Book' },
  { n: 3, label: 'Confirm Issue' },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="step-indicator" style={{ marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <div key={s.n} style={{ display: 'contents' }}>
          <div className={`step step--${current === s.n ? 'active' : current > s.n ? 'complete' : 'pending'}`}>
            <div className="step__num">{current > s.n ? '✓' : s.n}</div>
            <span className="step__label">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="step-divider" />}
        </div>
      ))}
    </div>
  );
}

/**
 * The identity banner carried through the rest of the flow.
 *
 * It keeps saying, at every step, how the student in front of the librarian
 * was actually identified. An issue backed by a checked signature and one
 * backed by a typed number look different all the way to the confirmation.
 */
function IdentityBanner({ student, signatureChecked }: { student: ScannedStudent; signatureChecked: boolean }) {
  const tone = signatureChecked
    ? { bg: 'var(--success-bg)', border: 'var(--success-border)', fg: 'var(--success)' }
    : { bg: 'var(--warning-bg)', border: 'var(--warning-border)', fg: 'var(--warning)' };
  const Icon = signatureChecked ? ShieldCheck : ShieldAlert;

  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={18} color={tone.fg} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--gray-900)' }}>{student.full_name}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>
            {student.student_id} · {student.department}
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: tone.fg, textAlign: 'right' }}>
          {signatureChecked ? 'CARD SIGNATURE CHECKED' : 'NO SIGNATURE CHECKED'}
        </span>
      </div>
    </div>
  );
}

export default function IssueBookPage() {
  const [step, setStep] = useState<Step>(1);
  const [student, setStudent] = useState<ScannedStudent | null>(null);
  const [signatureChecked, setSignatureChecked] = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [dueDays, setDueDays] = useState(14);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    bookTitle: string; studentName: string; dueDate: string;
    emailSent: boolean; signatureChecked: boolean;
    chainPosition: number | null; eventError: string | null;
  } | null>(null);

  function searchBooksAction(q: string) {
    setBookQuery(q);
    if (!q.trim()) { setBookResults([]); return; }
    startTransition(async () => {
      const r = await searchBooks({ query: q, status: 'available' });
      setBookResults(r as Book[]);
    });
  }

  function handleIdentified(scanned: ScannedStudent, checked: boolean) {
    setStudent(scanned);
    setSignatureChecked(checked);
    setError('');
    setStep(2);
  }

  function reset() {
    setSuccessData(null);
    setStep(1);
    setStudent(null);
    setSignatureChecked(false);
    setSelectedBook(null);
    setBookQuery('');
    setBookResults([]);
    setError('');
  }

  async function handleIssue() {
    if (!student || !selectedBook) return;
    setError('');
    startTransition(async () => {
      try {
        const result = await issueBook({
          studentPersonId: student.id,
          bookId: selectedBook.id,
          dueDays,
          signatureChecked,
        });
        setSuccessData({
          bookTitle: result.bookTitle,
          studentName: result.studentName,
          dueDate: result.dueDate,
          emailSent: result.emailSent,
          signatureChecked,
          chainPosition: result.chainPosition,
          eventError: result.eventError,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Issue failed. Please try again.');
      }
    });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  // ── Success ────────────────────────────────────────────────────────────
  if (successData) {
    return (
      <div className="lib-content">
        <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success-bg)', border: '2px solid var(--success-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={30} color="var(--success)" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', margin: '0 0 8px' }}>Book Issued</h1>
          <p style={{ fontSize: 14, color: 'var(--gray-500)', margin: '0 0 28px' }}>
            <strong>{successData.bookTitle}</strong> has been issued to <strong>{successData.studentName}</strong>.
          </p>

          <div className="card" style={{ marginBottom: 20, textAlign: 'left' }}>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Book', successData.bookTitle],
                  ['Student', successData.studentName],
                  ['Identified by', successData.signatureChecked ? 'Card signature' : 'Typed number'],
                  ['Issue Date', formatDate(new Date())],
                  ['Due Date', formatDate(successData.dueDate)],
                  ...(successData.chainPosition !== null
                    ? [['Chain position', String(successData.chainPosition)]]
                    : []),
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--gray-500)' }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`alert alert--${successData.emailSent ? 'success' : 'warning'}`} style={{ textAlign: 'left' }}>
            {successData.emailSent
              ? <><CheckCircle size={14} /> <span>Email notification sent, and recorded.</span></>
              : <><AlertTriangle size={14} /> <span>The email did not send, so nothing was recorded as sent.</span></>}
          </div>

          {successData.eventError && (
            <div className="alert alert--warning" style={{ textAlign: 'left', marginTop: 10 }}>
              <AlertTriangle size={14} />
              <span>The book was issued, but the campus event was not recorded: {successData.eventError}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <a href="/library" className="btn btn-secondary">Back to Dashboard</a>
            <button className="btn btn-primary" onClick={reset}>Scan the next card</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Issue Book</h1>
        <p className="lib-page-sub">Scan the student&rsquo;s card. A name picked from a list verifies nothing.</p>
      </div>

      <div style={{ maxWidth: 660 }}>
        <StepIndicator current={step} />

        {error && (
          <div className="alert alert--danger" style={{ marginBottom: 16 }}>
            <AlertTriangle size={14} /><span>{error}</span>
          </div>
        )}

        {/* ── Step 1: Scan the card ──────────────────────────────────── */}
        {step === 1 && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Identify Student</h3></div>
            <div className="card-body">
              <CardScanner onIdentified={handleIdentified} />
            </div>
          </div>
        )}

        {/* ── Step 2: Select the book ────────────────────────────────── */}
        {step === 2 && student && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Select Book</h3></div>
            <div className="card-body">
              <IdentityBanner student={student} signatureChecked={signatureChecked} />

              <div className="form-group">
                <label className="form-label">Search Books</label>
                <div className="search-box">
                  <Search size={15} />
                  <input className="form-input" placeholder="Title, author, ISBN or book code…" value={bookQuery}
                    onChange={e => searchBooksAction(e.target.value)} autoFocus />
                </div>
              </div>

              {bookResults.map(b => (
                <div key={b.id} onClick={() => { if (b.available_copies > 0) { setSelectedBook(b); setBookResults([]); } }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: b.available_copies > 0 ? 'pointer' : 'not-allowed', border: '1px solid var(--gray-200)', marginBottom: 8, opacity: b.available_copies === 0 ? 0.5 : 1 }}
                  className="quick-action-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--brand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={16} color="var(--brand-600)" />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{b.title}</p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-400)' }}>{b.author} · {b.book_code}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                      <span style={{ color: b.available_copies > 0 ? 'var(--success)' : 'var(--danger)' }}>{b.available_copies}</span>
                      <span style={{ color: 'var(--gray-400)' }}>/{b.total_copies}</span>
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--gray-400)' }}>available</p>
                  </div>
                </div>
              ))}

              {selectedBook && (
                <>
                  <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--success-bg)', border: '1px solid var(--success-border)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700 }}>Selected: {selectedBook.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>{selectedBook.available_copies} copies available</p>
                      </div>
                      <CheckCircle size={18} color="var(--success)" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Issue Duration</label>
                    <select className="form-select" value={dueDays} onChange={e => setDueDays(Number(e.target.value))}>
                      <option value={7}>7 days (1 week)</option>
                      <option value={14}>14 days (2 weeks)</option>
                      <option value={21}>21 days (3 weeks)</option>
                      <option value={30}>30 days (1 month)</option>
                    </select>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0 0' }}>
                      Due date: {formatDate(dueDate)}
                    </p>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={reset}>Scan a different card</button>
                <button className="btn btn-primary" disabled={!selectedBook} onClick={() => setStep(3)}>Continue</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ────────────────────────────────────────── */}
        {step === 3 && student && selectedBook && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Confirm Issue</h3></div>
            <div className="card-body">
              <IdentityBanner student={student} signatureChecked={signatureChecked} />

              {!signatureChecked && (
                <div className="alert alert--warning" style={{ marginBottom: 16 }}>
                  <ShieldAlert size={14} />
                  <span>
                    This student was found by number, not by card. The issue will be recorded with
                    <strong> signature_checked: false</strong>.
                  </span>
                </div>
              )}

              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Student', student.full_name ?? ''],
                  ['Student ID', student.student_id ?? ''],
                  ['Book', selectedBook.title],
                  ['Book Code', selectedBook.book_code],
                  ['Issue Date', formatDate(new Date())],
                  ['Due Date', formatDate(dueDate)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--gray-200)', paddingBottom: 10 }}>
                    <span style={{ color: 'var(--gray-500)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="alert alert--info" style={{ marginBottom: 16 }}>
                <Calendar size={14} />
                <span>An email notification will be sent to <strong>{student.email}</strong> once the book is issued.</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={isPending}>Back</button>
                <button className="btn btn-success" onClick={handleIssue} disabled={isPending}>
                  {isPending ? <><Loader2 size={14} className="spin" /> Issuing…</> : '✓ Confirm Issue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
