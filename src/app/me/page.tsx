import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { BadgeCheck, BookMarked, CircleAlert, Clock, ShieldOff, Timer } from 'lucide-react';

import { formatDate } from '@/lib/format';
import { getLibraryStanding, getPassCard, getStudentProfile } from '@/lib/student/data';
import { readStudentSession } from '@/lib/student/session';

import { PassChrome } from './pass-chrome';

export const metadata = { title: 'My Pass · GBPUAT Smart Identity' };

/**
 * The pass.
 *
 * The screen answers one question before any other: will this card be accepted
 * if I present it right now. That verdict is not read off a status column — it
 * is produced by running the same verification the gate runs, so an expired
 * card reads as expired even though its status is still "active", and a card
 * blocked ten seconds ago reads as blocked.
 *
 * When the answer is no, the QR is struck through rather than shown cleanly.
 * A student should not walk to a gate holding a scannable-looking code that is
 * going to be refused when they get there.
 */

type Tone = 'ok' | 'warn' | 'bad';

function verdictFor(state: string | null | undefined, verified: boolean) {
  const map: Record<string, { tone: Tone; headline: string; advice: string }> = {
    VALID: {
      tone: 'ok',
      headline: 'Valid for entry',
      advice: 'Present this at the gate or the library desk.',
    },
    EXPIRED: {
      tone: 'warn',
      headline: 'Expired',
      advice: 'The signature is genuine but the card is past its expiry date. The registry office can re-issue it.',
    },
    REVOKED: {
      tone: 'bad',
      headline: 'Blocked',
      advice: 'The university has blocked this card. Speak to the registry office — it will be refused at every gate.',
    },
    SUSPENDED: {
      tone: 'bad',
      headline: 'Suspended',
      advice: 'This card is suspended pending review and will not be accepted.',
    },
  };

  return (
    map[state ?? ''] ?? {
      tone: (verified ? 'ok' : 'bad') as Tone,
      headline: verified ? 'Valid for entry' : 'Not accepted',
      advice: 'This card did not pass the university signature check. Take it to the registry office.',
    }
  );
}

export default async function StudentPassPage() {
  const session = await readStudentSession();
  if (!session) redirect('/me/sign-in');

  const [profile, card, library] = await Promise.all([
    getStudentProfile(session.personId),
    getPassCard(session.personId),
    getLibraryStanding(session.personId),
  ]);

  if (!profile) redirect('/me/sign-in');

  const verdict = card ? verdictFor(card.verdict.state, card.verdict.verified) : null;
  const accepted = verdict?.tone === 'ok';

  const qr = card
    ? await QRCode.toString(card.compactJws, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
        color: { dark: '#0a1020', light: '#ffffff' },
      })
    : null;

  const VerdictIcon = accepted ? BadgeCheck : verdict?.tone === 'warn' ? Timer : ShieldOff;

  return (
    <PassChrome session={session} active="/me">
      <section className="pass-card">
        <div className="pass-card__head">
          <div style={{ minWidth: 0 }}>
            <p className="pass-card__uni">{profile.universityName}</p>
            <h1 className="pass-card__name">{profile.fullName}</h1>
            <p className="pass-card__meta">
              <span className="pass-card__number">{profile.studentNumber ?? 'No number'}</span>
            </p>
          </div>
          {card ? (
            <span className={`pass-chip pass-chip--${verdict!.tone}`}>{card.verdict.state ?? '—'}</span>
          ) : null}
        </div>

        {card && qr ? (
          <div className={`pass-qr${accepted ? '' : ' pass-qr--muted'}`}>
            <div
              style={{ width: '100%' }}
              // The QR is the credential itself: a compact JWS the university
              // signed. Rendered server-side, so the browser never has to be
              // trusted with producing it.
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            {accepted ? null : (
              <p className="pass-qr__struck">{verdict!.headline} — do not present</p>
            )}
          </div>
        ) : (
          <div className="pass-empty" style={{ background: '#ffffff', borderRadius: 14, color: '#64748b' }}>
            No card has been issued to you yet. The card operator at the registry office issues
            these.
          </div>
        )}

        <div className="pass-card__foot">
          <div>
            <p className="pass-fact__label">Programme</p>
            <p className="pass-fact__value">{profile.programme ?? profile.department ?? '—'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="pass-fact__label">Valid until</p>
            <p className="pass-fact__value">
              {card?.expiresAt ? formatDate(card.expiresAt) : '—'}
            </p>
          </div>
        </div>
      </section>

      {card && verdict ? (
        <section className={`pass-verdict pass-verdict--${verdict.tone}`}>
          <p className="pass-verdict__headline">
            <VerdictIcon size={19} />
            {verdict.headline}
          </p>
          <p className="pass-verdict__detail">{verdict.advice}</p>
          <p className="pass-verdict__checked">
            Checked just now against the university signing key, and against the live block list.
            This is the same check the gate makes.
          </p>
        </section>
      ) : null}

      <div className="pass-stats">
        <div className="pass-stat">
          <p className="pass-stat__value">{library.onLoan.length}</p>
          <p className="pass-stat__label">On loan</p>
        </div>
        <div className={`pass-stat${library.overdueCount > 0 ? ' pass-stat--alert' : ''}`}>
          <p className="pass-stat__value">{library.overdueCount}</p>
          <p className="pass-stat__label">Overdue</p>
        </div>
        <div className="pass-stat">
          <p className="pass-stat__value">
            {library.nextDue?.dueDate ? formatDate(library.nextDue.dueDate).slice(0, 6) : '—'}
          </p>
          <p className="pass-stat__label">Next due</p>
        </div>
      </div>

      {library.overdueCount > 0 ? (
        <section className="pass-verdict pass-verdict--warn" style={{ marginTop: 12 }}>
          <p className="pass-verdict__headline">
            <CircleAlert size={19} />
            {library.overdueCount} book{library.overdueCount === 1 ? '' : 's'} overdue
          </p>
          <p className="pass-verdict__detail">
            {library.onLoan
              .filter((loan) => loan.daysOverdue > 0)
              .map((loan) => `${loan.title} (${loan.daysOverdue}d)`)
              .join(', ')}
          </p>
        </section>
      ) : null}

      {library.onLoan.length > 0 ? (
        <section className="pass-panel">
          <div className="pass-panel__head">
            <p className="pass-panel__title">Currently borrowed</p>
            <p className="pass-panel__note">{library.onLoan.length} out</p>
          </div>
          {library.onLoan.slice(0, 3).map((loan) => (
            <div key={loan.id} className="pass-row">
              <div className={`pass-row__icon${loan.daysOverdue > 0 ? ' pass-row__icon--bad' : ''}`}>
                <BookMarked size={15} />
              </div>
              <div className="pass-row__body">
                <p className="pass-row__title">{loan.title}</p>
                <p className="pass-row__sub">
                  {loan.daysOverdue > 0
                    ? `${loan.daysOverdue} day${loan.daysOverdue === 1 ? '' : 's'} overdue`
                    : loan.dueDate
                      ? `Due ${formatDate(loan.dueDate)}`
                      : 'No due date'}
                </p>
              </div>
              <div className="pass-row__aside">
                <Clock size={13} />
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </PassChrome>
  );
}
