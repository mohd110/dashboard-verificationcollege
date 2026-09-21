import { redirect } from 'next/navigation';
import { BookMarked, BookOpen, DoorOpen, IdCard, Mail, ShieldCheck, ShieldX } from 'lucide-react';

import { formatDate, formatTime } from '@/lib/format';
import { getStudentActivity } from '@/lib/student/data';
import { readStudentSession } from '@/lib/student/session';
import {
  EVENT_LABELS,
  FAILED_RESULTS,
  type CampusEventResult,
  type CampusEventType,
} from '@/lib/types';

import { PassChrome } from '../pass-chrome';

export const metadata = { title: 'My Activity · GBPUAT Smart Identity' };

const ICONS: Record<string, typeof ShieldCheck> = {
  IDENTITY_VERIFIED: ShieldCheck,
  IDENTITY_REJECTED: ShieldX,
  LIBRARY_ENTRY: DoorOpen,
  BOOK_ISSUED: BookOpen,
  BOOK_RETURNED: BookMarked,
  NOTIFICATION_SENT: Mail,
  CARD_ISSUED: IdCard,
  CARD_BLOCKED: ShieldX,
};

/**
 * The student's own side of the activity record.
 *
 * The same rows the auditor and the registrar see, filtered to one person and
 * shown to the person they are about. Nothing here is a fixture: an empty list
 * means nothing has genuinely happened yet.
 */
export default async function StudentActivityPage() {
  const session = await readStudentSession();
  if (!session) redirect('/me/sign-in');

  const events = await getStudentActivity(session.personId);

  const days = new Map<string, typeof events>();
  for (const event of events) {
    const day = formatDate(event.occurredAt);
    const bucket = days.get(day);
    if (bucket) bucket.push(event);
    else days.set(day, [event]);
  }

  return (
    <PassChrome session={session} active="/me/activity">
      <h1 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
        My activity
      </h1>
      <p
        style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--p-ink-soft)' }}
      >
        Every gate check, library visit and card event recorded against you. This is the university
        record, not a copy of it.
      </p>

      <section className="pass-panel" style={{ marginTop: 0 }}>
        {events.length === 0 ? (
          <div className="pass-empty">
            Nothing recorded yet. The first time your card is scanned at a gate or a library desk,
            it will appear here.
          </div>
        ) : (
          [...days.entries()].map(([day, dayEvents]) => (
            <div key={day}>
              <p className="pass-daystamp">{day}</p>
              {dayEvents.map((event) => {
                const failed = FAILED_RESULTS.includes(event.result as CampusEventResult);
                const Icon = ICONS[event.eventType] ?? ShieldCheck;
                const bookTitle = event.metadata.book_title;

                return (
                  <div key={event.id} className="pass-row">
                    <div
                      className={`pass-row__icon ${
                        failed ? 'pass-row__icon--bad' : 'pass-row__icon--ok'
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="pass-row__body">
                      <p className="pass-row__title">
                        {EVENT_LABELS[event.eventType as CampusEventType] ?? event.eventType}
                      </p>
                      <p className="pass-row__sub">
                        {event.locationName ?? 'Campus'}
                        {typeof bookTitle === 'string' ? ` · ${bookTitle}` : ''}
                      </p>
                    </div>
                    <div className="pass-row__aside">
                      {formatTime(event.occurredAt)}
                      <br />
                      <span style={{ fontSize: 9.5, opacity: 0.75 }}>#{event.seq}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      <p className="pass-note">
        The number beside each entry is its position in the university&rsquo;s record. Positions run
        in order without gaps, which is what makes a later change to your history detectable.
      </p>
    </PassChrome>
  );
}
