import { redirect } from 'next/navigation';
import { CalendarDays, CircleCheck, CircleX, Clock, MapPin, Phone, Radio } from 'lucide-react';

import { formatDate, formatTime } from '@/lib/format';
import { getStudentFests, getStudentProfile, type MyFestDay } from '@/lib/student/data';
import { readStudentSession } from '@/lib/student/session';

import { PassChrome } from '../pass-chrome';

export const metadata = { title: 'Events · GBPUAT Smart Identity' };

/** The day's standing, in the words a student would use about it. */
function dayChip(day: MyFestDay) {
  if (day.status === 'approved') {
    return { tone: 'ok', icon: CircleCheck, label: 'Regularised' } as const;
  }
  if (day.status === 'rejected') {
    return { tone: 'bad', icon: CircleX, label: 'Not regularised' } as const;
  }
  if (day.status === 'not_applicable') {
    return { tone: 'ok', icon: CircleCheck, label: 'Attended' } as const;
  }
  return { tone: 'warn', icon: Clock, label: 'Awaiting approval' } as const;
}

export default async function StudentEventsPage() {
  const session = await readStudentSession();
  if (!session) redirect('/me/sign-in');

  const profile = await getStudentProfile(session.personId);
  if (!profile) redirect('/me/sign-in');

  const { onCampus, mine } = await getStudentFests(session.personId, profile.universityId);

  return (
    <PassChrome session={session} active="/me/events">
      <h1 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
        Events
      </h1>
      <p
        style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--p-ink-soft)' }}
      >
        What is on at the university, and whether the days you spent at a fest have been counted
        towards your class attendance.
      </p>

      <section className="pass-panel" style={{ marginTop: 0 }}>
        <div className="pass-panel__head">
          <p className="pass-panel__title">On campus</p>
          <p className="pass-panel__note">{onCampus.length ? 'Live and upcoming' : ''}</p>
        </div>

        {onCampus.length === 0 ? (
          <div className="pass-empty">Nothing is scheduled right now.</div>
        ) : (
          onCampus.map((fest) => (
            <div key={fest.id} style={{ borderTop: '1px solid var(--p-line)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {fest.name}
                </p>
                {fest.live ? (
                  <span className="pass-chip pass-chip--ok">
                    <Radio size={10} />
                    Live
                  </span>
                ) : (
                  <span className="pass-chip pass-chip--warn">Soon</span>
                )}
              </div>

              <p className="pass-row__sub" style={{ marginTop: 5 }}>
                <CalendarDays size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                {formatDate(fest.startsAt)} {formatTime(fest.startsAt)} – {formatDate(fest.endsAt)}{' '}
                {formatTime(fest.endsAt)}
              </p>
              {fest.venue ? (
                <p className="pass-row__sub">
                  <MapPin size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                  {fest.venue}
                </p>
              ) : null}
              {fest.description ? (
                <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--p-ink-soft)' }}>
                  {fest.description}
                </p>
              ) : null}

              {fest.regulariseAttendance ? (
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--p-ok)' }}>
                  Class attendance is regularised for students scanned in at the gate.
                </p>
              ) : null}

              {fest.coordinators.length > 0 ? (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fest.coordinators.map((person) => (
                    <div
                      key={`${person.name}-${person.designation}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: 'var(--p-surface-2)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{person.name}</p>
                        <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-ink-faint)' }}>
                          {person.designation}
                        </p>
                      </div>
                      {person.phone ? (
                        <a
                          href={`tel:${person.phone}`}
                          aria-label={`Call ${person.name}`}
                          className="pass-chip pass-chip--ok"
                          style={{ textDecoration: 'none' }}
                        >
                          <Phone size={10} />
                          Call
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="pass-panel">
        <div className="pass-panel__head">
          <p className="pass-panel__title">My fest attendance</p>
          <p className="pass-panel__note">{mine.length || ''}</p>
        </div>

        {mine.length === 0 ? (
          <div className="pass-empty">
            When your card is scanned at a fest gate, the day appears here with its regularisation
            status.
          </div>
        ) : (
          mine.map((fest) => (
            <div key={fest.festId}>
              <p className="pass-daystamp">{fest.name}</p>
              {fest.days.map((day) => {
                const chip = dayChip(day);
                const Icon = chip.icon;
                return (
                  <div key={day.day} className="pass-row">
                    <div
                      className={`pass-row__icon ${
                        chip.tone === 'bad' ? 'pass-row__icon--bad' : chip.tone === 'ok' ? 'pass-row__icon--ok' : ''
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="pass-row__body">
                      <p className="pass-row__title">{formatDate(`${day.day}T12:00:00+05:30`)}</p>
                      <p className="pass-row__sub">
                        {day.scanned
                          ? 'Scanned in at the gate'
                          : day.basis === 'on_duty'
                            ? 'On duty at the fest'
                            : 'Added by the organisers'}
                      </p>
                    </div>
                    <div className="pass-row__aside">
                      <span className={`pass-chip pass-chip--${chip.tone}`}>{chip.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      <p className="pass-note">
        Attendance at a fest comes from the university&rsquo;s gate record, not from anything you
        or the organisers type in. If a day you attended is missing, a coordinator can add it with a
        reason.
      </p>
    </PassChrome>
  );
}
