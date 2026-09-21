import { redirect } from 'next/navigation';
import { BookMarked, BookOpen, CircleAlert } from 'lucide-react';

import { formatDate } from '@/lib/format';
import { getLibraryStanding } from '@/lib/student/data';
import { readStudentSession } from '@/lib/student/session';

import { PassChrome } from '../pass-chrome';

export const metadata = { title: 'My Library · GBPUAT Smart Identity' };

export default async function StudentLibraryPage() {
  const session = await readStudentSession();
  if (!session) redirect('/me/sign-in');

  const { onLoan, returned, overdueCount } = await getLibraryStanding(session.personId);

  return (
    <PassChrome session={session} active="/me/library">
      <h1 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
        My library
      </h1>
      <p
        style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--p-ink-soft)' }}
      >
        What you have out, and what you have had before.
      </p>

      {overdueCount > 0 ? (
        <section
          className="pass-verdict pass-verdict--bad"
          style={{ marginTop: 0, marginBottom: 16 }}
        >
          <p className="pass-verdict__headline">
            <CircleAlert size={19} />
            {overdueCount} overdue
          </p>
          <p className="pass-verdict__detail">
            Please return {overdueCount === 1 ? 'it' : 'them'} to the Central Library desk.
          </p>
        </section>
      ) : null}

      <section className="pass-panel" style={{ marginTop: 0 }}>
        <div className="pass-panel__head">
          <p className="pass-panel__title">On loan</p>
          <p className="pass-panel__note">{onLoan.length}</p>
        </div>

        {onLoan.length === 0 ? (
          <div className="pass-empty">You have no books out at the moment.</div>
        ) : (
          onLoan.map((loan) => (
            <div key={loan.id} className="pass-row">
              <div
                className={`pass-row__icon${loan.daysOverdue > 0 ? ' pass-row__icon--bad' : ''}`}
              >
                <BookOpen size={15} />
              </div>
              <div className="pass-row__body">
                <p className="pass-row__title">{loan.title}</p>
                <p className="pass-row__sub">
                  {loan.author ?? 'Unknown author'}
                  {loan.bookCode ? ` · ${loan.bookCode}` : ''}
                </p>
              </div>
              <div className="pass-row__aside">
                {loan.daysOverdue > 0 ? (
                  <span style={{ color: 'var(--p-bad)', fontWeight: 700 }}>
                    {loan.daysOverdue}d late
                  </span>
                ) : loan.dueDate ? (
                  <>
                    Due
                    <br />
                    {formatDate(loan.dueDate)}
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="pass-panel">
        <div className="pass-panel__head">
          <p className="pass-panel__title">Returned</p>
          <p className="pass-panel__note">{returned.length}</p>
        </div>

        {returned.length === 0 ? (
          <div className="pass-empty">Nothing returned yet.</div>
        ) : (
          returned.slice(0, 15).map((loan) => (
            <div key={loan.id} className="pass-row">
              <div className="pass-row__icon pass-row__icon--ok">
                <BookMarked size={15} />
              </div>
              <div className="pass-row__body">
                <p className="pass-row__title">{loan.title}</p>
                <p className="pass-row__sub">{loan.bookCode ?? '—'}</p>
              </div>
              <div className="pass-row__aside">
                {loan.returnedAt ? formatDate(loan.returnedAt) : '—'}
              </div>
            </div>
          ))
        )}
      </section>
    </PassChrome>
  );
}
