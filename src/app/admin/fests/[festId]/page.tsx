import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CheckCheck,
  ClipboardCheck,
  Download,
  Phone,
  ScanLine,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  Notice,
  PageHeading,
  Row,
  StatTile,
  inputClass,
} from '@/components/ui';
import {
  FestTablesMissing,
  festDays,
  getAttendance,
  getFest,
  listCoordinators,
  listDuties,
  listGuardStaff,
  phaseOf,
  toCampusInput,
  type AttendanceRow,
  type AttendanceSummary,
  type Fest,
} from '@/lib/fests';
import { campusToday, formatDate, formatTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';

import {
  addCoordinator,
  addOnDuty,
  approveAllPending,
  assignGuard,
  cancelFest,
  decideRegularisation,
  removeCoordinator,
  removeDuty,
} from '../actions';
import { MigrationNotice, PhaseBadge } from '../fest-ui';

export const metadata = { title: 'Fest · GBPUAT Smart Identity' };

const BASIS_LABEL = { scanned: 'Gate scan', on_duty: 'On duty', manual: 'Manual' } as const;

function StatusBadge({ row }: { row: AttendanceRow }) {
  if (row.status === 'approved') return <Badge tone="good">Regularised</Badge>;
  if (row.status === 'rejected') return <Badge tone="bad">Rejected</Badge>;
  return <Badge tone="warn">Pending</Badge>;
}

/* ── Guard duties ─────────────────────────────────────────────────────── */

async function Duties({ fest, locked }: { fest: Fest; locked: boolean }) {
  const [duties, guards] = await Promise.all([listDuties(fest.id), listGuardStaff()]);
  const now = new Date();

  return (
    <Card
      title="Guards on duty"
      description="For the length of a shift, the gate app records that guard’s scans against this fest"
    >
      {duties.length === 0 ? (
        <EmptyState>No guards rostered yet.</EmptyState>
      ) : (
        <DataTable compact head={['Guard', 'Post', 'Shift', '']}>
          {duties.map((duty) => {
            const onNow =
              new Date(duty.shiftStartsAt) <= now && now < new Date(duty.shiftEndsAt);

            return (
              <Row key={duty.id}>
                <td className="px-5 py-2.5 text-sm font-medium">
                  {duty.guardName}
                  {onNow ? (
                    <span className="ml-2">
                      <Badge tone="good">On now</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-2.5 text-sm">{duty.post}</td>
                <td className="px-5 py-2.5 text-xs whitespace-nowrap text-muted">
                  {formatDate(duty.shiftStartsAt)} {formatTime(duty.shiftStartsAt)}–
                  {formatTime(duty.shiftEndsAt)}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {locked ? null : (
                    <ActionForm
                      action={removeDuty}
                      submitLabel="Remove"
                      pendingLabel="…"
                      variant="quiet"
                      hidden={{ festId: fest.id, id: duty.id }}
                    />
                  )}
                </td>
              </Row>
            );
          })}
        </DataTable>
      )}

      {locked ? null : (
        <div className="border-t border-line-soft px-5 py-4">
          {guards.length === 0 ? (
            <p className="text-sm text-muted">
              Nobody holds the guard role yet. Grant it on the Users screen.
            </p>
          ) : (
            <ActionForm
              action={assignGuard}
              submitLabel="Assign guard"
              pendingLabel="Assigning…"
              hidden={{ festId: fest.id }}
            >
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <Field label="Guard" htmlFor="guardUserId">
                  <select id="guardUserId" name="guardUserId" required className={inputClass}>
                    {guards.map((guard) => (
                      <option key={guard.id} value={guard.id}>
                        {guard.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Post" htmlFor="post">
                  <input
                    id="post"
                    name="post"
                    required
                    placeholder="Gate B · Main stage"
                    className={inputClass}
                  />
                </Field>
                <Field label="Shift starts" htmlFor="shiftStartsAt">
                  <input
                    id="shiftStartsAt"
                    name="shiftStartsAt"
                    type="datetime-local"
                    required
                    defaultValue={toCampusInput(fest.startsAt)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Shift ends" htmlFor="shiftEndsAt">
                  <input
                    id="shiftEndsAt"
                    name="shiftEndsAt"
                    type="datetime-local"
                    required
                    defaultValue={toCampusInput(fest.endsAt)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Coordinators ─────────────────────────────────────────────────────── */

async function Coordinators({ fest, locked }: { fest: Fest; locked: boolean }) {
  const coordinators = await listCoordinators(fest.id);

  return (
    <Card
      title="Coordinators"
      description="Shown to guards on duty, and to students on their pass"
    >
      {coordinators.length === 0 ? (
        <EmptyState>No coordinators listed yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {coordinators.map((person) => (
            <li key={person.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {person.fullName}
                  <span className="ml-2 align-middle">
                    <Badge tone={person.kind === 'faculty' ? 'info' : 'quiet'}>{person.kind}</Badge>
                  </span>
                </p>
                <p className="text-xs text-muted">{person.designation}</p>
                {person.phone || person.email ? (
                  <p className="mt-0.5 text-xs text-faint">
                    {person.phone ? (
                      <a href={`tel:${person.phone}`} className="hover:text-brand-mid">
                        <Phone size={11} className="mr-1 inline" />
                        {person.phone}
                      </a>
                    ) : null}
                    {person.phone && person.email ? ' · ' : null}
                    {person.email}
                  </p>
                ) : null}
              </div>
              {locked ? null : (
                <ActionForm
                  action={removeCoordinator}
                  submitLabel="Remove"
                  pendingLabel="…"
                  variant="quiet"
                  hidden={{ festId: fest.id, id: person.id }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <div className="border-t border-line-soft px-5 py-4">
          <ActionForm
            action={addCoordinator}
            submitLabel="Add coordinator"
            pendingLabel="Adding…"
            hidden={{ festId: fest.id }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="fullName">
                <input id="fullName" name="fullName" required className={inputClass} />
              </Field>
              <Field label="Coordinates" htmlFor="designation">
                <input
                  id="designation"
                  name="designation"
                  required
                  placeholder="Faculty Coordinator · Cultural"
                  className={inputClass}
                />
              </Field>
              <Field label="Kind" htmlFor="kind">
                <select id="kind" name="kind" className={inputClass} defaultValue="faculty">
                  <option value="faculty">Faculty</option>
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                  <option value="volunteer">Volunteer</option>
                </select>
              </Field>
              <Field label="Phone" htmlFor="phone">
                <input id="phone" name="phone" type="tel" className={inputClass} placeholder="+91 98…" />
              </Field>
              <Field label="Email" htmlFor="email">
                <input id="email" name="email" type="email" className={inputClass} />
              </Field>
              <Field label="Student number" htmlFor="studentNumber" hint="For a student coordinator">
                <input id="studentNumber" name="studentNumber" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        </div>
      )}
    </Card>
  );
}

/* ── Attendance ───────────────────────────────────────────────────────── */

function Attendance({
  fest,
  day,
  summary,
}: {
  fest: Fest;
  day: string;
  summary: AttendanceSummary;
}) {
  const days = festDays(fest);
  const rows = summary.rows.filter((row) => row.day === day);
  const pending = rows.filter((row) => row.status === 'pending');

  return (
    <Card
      title="Attendance & regularisation"
      description={
        fest.regulariseAttendance
          ? 'Read from the hash-chained gate record. Approve a day to excuse the student from class.'
          : 'This fest does not regularise class attendance; the roster is for reference.'
      }
      action={
        <a
          href={`/admin/fests/${fest.id}/export`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-ink-soft hover:bg-canvas"
        >
          <Download size={14} />
          Export approved (CSV)
        </a>
      }
    >
      <nav className="flex flex-wrap gap-1.5 border-b border-line-soft px-5 py-3" aria-label="Fest days">
        {days.map((value) => {
          const counts = summary.byDay[value];
          const active = value === day;
          return (
            <Link
              key={value}
              href={`/admin/fests/${fest.id}?day=${value}`}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? 'bg-brand text-white' : 'bg-canvas text-ink-soft hover:bg-line-soft'
              }`}
            >
              {formatDate(`${value}T12:00:00+05:30`)}
              <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-faint'}`}>
                {counts?.attendees ?? 0}
                {counts?.pending ? ` · ${counts.pending} pending` : ''}
              </span>
            </Link>
          );
        })}
      </nav>

      {fest.regulariseAttendance && pending.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-warn-light/50 px-5 py-3">
          <p className="text-sm text-warn">
            {pending.length} student{pending.length === 1 ? '' : 's'} waiting for a decision on
            this day.
          </p>
          <ActionForm
            action={approveAllPending}
            submitLabel={`Approve all ${pending.length}`}
            pendingLabel="Approving…"
            hidden={{
              festId: fest.id,
              day,
              personIds: pending.map((row) => row.personId).join(','),
            }}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Nobody yet">
          No one was scanned at this fest on this day. Students appear here the moment a guard on
          duty checks their card.
        </EmptyState>
      ) : (
        <DataTable head={['Student', 'Department', 'First seen', 'Basis', 'Status', '']}>
          {rows.map((row) => (
            <Row key={`${row.personId}-${row.day}`}>
              <td className="px-5 py-3">
                <span className="font-medium text-ink">{row.fullName}</span>
                <span className="block font-mono text-xs text-faint">{row.studentNumber ?? '—'}</span>
              </td>
              <td className="px-5 py-3 text-sm">{row.department ?? '—'}</td>
              <td className="px-5 py-3 text-sm whitespace-nowrap">
                {row.firstSeen ? formatTime(row.firstSeen) : '—'}
                {row.scans > 1 ? (
                  <span className="block text-xs text-faint">{row.scans} scans</span>
                ) : null}
              </td>
              <td className="px-5 py-3 text-sm">
                {BASIS_LABEL[row.basis]}
                {row.note ? <span className="block text-xs text-faint">{row.note}</span> : null}
              </td>
              <td className="px-5 py-3">
                <StatusBadge row={row} />
              </td>
              <td className="px-5 py-3 text-right">
                {fest.regulariseAttendance ? (
                  <div className="flex justify-end gap-2">
                    {row.status !== 'approved' ? (
                      <ActionForm
                        action={decideRegularisation}
                        submitLabel="Approve"
                        pendingLabel="…"
                        variant="quiet"
                        hidden={{
                          festId: fest.id,
                          personId: row.personId,
                          day: row.day,
                          status: 'approved',
                          basis: row.basis,
                          ...(row.note ? { note: row.note } : {}),
                        }}
                      />
                    ) : null}
                    {row.status !== 'rejected' ? (
                      <ActionForm
                        action={decideRegularisation}
                        submitLabel="Reject"
                        pendingLabel="…"
                        variant="quiet"
                        hidden={{
                          festId: fest.id,
                          personId: row.personId,
                          day: row.day,
                          status: 'rejected',
                          basis: row.basis,
                          ...(row.note ? { note: row.note } : {}),
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </td>
            </Row>
          ))}
        </DataTable>
      )}

      {fest.regulariseAttendance ? (
        <div className="border-t border-line-soft px-5 py-4">
          <p className="mb-3 text-sm font-medium text-ink-soft">
            Add a student who worked the fest without passing a gate
          </p>
          <ActionForm
            action={addOnDuty}
            submitLabel="Regularise"
            pendingLabel="Saving…"
            hidden={{ festId: fest.id }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <Field label="Student number" htmlFor="od-number">
                <input id="od-number" name="studentNumber" required className={inputClass} />
              </Field>
              <Field label="Day" htmlFor="od-day">
                <select id="od-day" name="day" defaultValue={day} className={inputClass}>
                  {days.map((value) => (
                    <option key={value} value={value}>
                      {formatDate(`${value}T12:00:00+05:30`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Basis" htmlFor="od-basis">
                <select id="od-basis" name="basis" defaultValue="on_duty" className={inputClass}>
                  <option value="on_duty">On duty</option>
                  <option value="manual">Manual</option>
                </select>
              </Field>
              <Field label="Reason" htmlFor="od-note">
                <input
                  id="od-note"
                  name="note"
                  required
                  placeholder="Registration desk volunteer"
                  className={inputClass}
                />
              </Field>
            </div>
          </ActionForm>
        </div>
      ) : null}
    </Card>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default async function FestPage({
  params,
  searchParams,
}: {
  params: Promise<{ festId: string }>;
  searchParams: Promise<{ day?: string; created?: string }>;
}) {
  await requireAdminSession();
  const { festId } = await params;
  const { day: requestedDay, created } = await searchParams;

  let fest: Fest | null;
  try {
    fest = await getFest(festId);
  } catch (error) {
    if (error instanceof FestTablesMissing) {
      return (
        <>
          <PageHeading title="Fest" />
          <MigrationNotice />
        </>
      );
    }
    throw error;
  }

  if (!fest) notFound();

  const phase = phaseOf(fest);
  const locked = phase === 'cancelled';
  const days = festDays(fest);
  const today = campusToday();
  const day =
    requestedDay && days.includes(requestedDay)
      ? requestedDay
      : days.includes(today)
        ? today
        : days[0];

  const [summary, duties] = await Promise.all([getAttendance(fest), listDuties(fest.id)]);
  const now = new Date();
  const onDutyNow = duties.filter(
    (duty) => new Date(duty.shiftStartsAt) <= now && now < new Date(duty.shiftEndsAt),
  ).length;
  const pendingTotal = summary.rows.filter((row) => row.status === 'pending').length;

  return (
    <>
      <Link
        href="/admin/fests"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand-mid"
      >
        <ArrowLeft size={15} />
        All fests
      </Link>

      <PageHeading
        title={fest.name}
        description={`${formatDate(fest.startsAt)} ${formatTime(fest.startsAt)} – ${formatDate(
          fest.endsAt,
        )} ${formatTime(fest.endsAt)}${fest.venue ? ` · ${fest.venue}` : ''}`}
        action={<PhaseBadge phase={phase} />}
      />

      {created ? (
        <div className="mb-6">
          <Notice tone="ok" title="Fest created">
            It has its own gate on the activity record already. Roster the guards next: a guard on
            shift here records their scans against this fest, and those scans become the
            attendance roster.
          </Notice>
        </div>
      ) : null}

      {locked ? (
        <div className="mb-6">
          <Notice tone="bad" title="Cancelled">
            This fest&rsquo;s location has been retired, so its gates no longer accept scans. The
            attendance already recorded is kept.
          </Notice>
        </div>
      ) : null}

      {fest.description ? <p className="mb-6 max-w-3xl text-sm text-ink-soft">{fest.description}</p> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Students attended"
          value={summary.uniqueAttendees}
          icon={<Users size={17} />}
          tone="blue"
        />
        <StatTile
          label="Gate scans"
          value={summary.scansTotal}
          icon={<ScanLine size={17} />}
          tone="grey"
        />
        <StatTile
          label="Guards on duty now"
          value={`${onDutyNow} / ${duties.length}`}
          icon={<ShieldCheck size={17} />}
          tone="green"
        />
        <StatTile
          label="Awaiting regularisation"
          value={pendingTotal}
          icon={pendingTotal > 0 ? <ClipboardCheck size={17} /> : <CheckCheck size={17} />}
          tone={pendingTotal > 0 ? 'amber' : 'green'}
        />
      </div>

      <div className="mb-6">
        <Attendance fest={fest} day={day} summary={summary} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2 xl:items-start">
        <Duties fest={fest} locked={locked} />
        <Coordinators fest={fest} locked={locked} />
      </div>

      {locked || phase === 'ended' ? null : (
        <Card title="Cancel this fest" padded>
          <ActionForm
            action={cancelFest}
            submitLabel="Cancel fest"
            pendingLabel="Cancelling…"
            variant="danger"
            hidden={{ festId: fest.id }}
          >
            <p className="mb-3 text-sm text-muted">
              Retires the fest&rsquo;s gate so no further scans can be recorded there, even by a
              guard still holding a shift. Attendance already recorded is kept.
            </p>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
