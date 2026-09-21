import Link from 'next/link';
import { CalendarDays, PartyPopper, Radio, Users } from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import {
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeading,
  Row,
  StatTile,
  inputClass,
} from '@/components/ui';
import {
  FEST_CATEGORIES,
  FestTablesMissing,
  listFests,
  phaseOf,
  toCampusInput,
  type Fest,
} from '@/lib/fests';
import { formatDate, formatTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';

import { createFest } from './actions';
import { MigrationNotice, PhaseBadge } from './fest-ui';

export const metadata = { title: 'Fests & Events · GBPUAT Smart Identity' };

function CreateFestForm() {
  // The next whole hour, and two days on: a reasonable first guess that the
  // administrator will almost always change, but never has to type from blank.
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 86_400_000);

  return (
    <ActionForm action={createFest} submitLabel="Create fest" pendingLabel="Creating…" full>
      <div className="mb-4 grid gap-4">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required className={inputClass} placeholder="Kisan Mela 2026" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select id="category" name="category" className={inputClass} defaultValue="cultural">
              {FEST_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue" htmlFor="venue">
            <input id="venue" name="venue" className={inputClass} placeholder="Gandhi Hall grounds" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens" htmlFor="startsAt" hint="Campus time">
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toCampusInput(start.toISOString())}
              className={inputClass}
            />
          </Field>
          <Field label="Closes" htmlFor="endsAt" hint="Campus time">
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={toCampusInput(end.toISOString())}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={3}
            className={inputClass}
            placeholder="What the fest is, who it is for."
          />
        </Field>

        <label className="flex items-start gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="regularise"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-line"
          />
          <span>
            Regularise class attendance for students who attend
            <span className="block text-xs text-faint">
              Their gate scans become a roster the administrator approves, day by day.
            </span>
          </span>
        </label>
      </div>
    </ActionForm>
  );
}

function FestTable({ fests }: { fests: Fest[] }) {
  if (fests.length === 0) {
    return (
      <EmptyState title="No fests yet">
        Create the first one with the form alongside. It gets its own gate on the activity record
        from the moment it exists.
      </EmptyState>
    );
  }

  return (
    <DataTable head={['Fest', 'When', 'Category', 'Status', '']}>
      {fests.map((fest) => (
        <Row key={fest.id}>
          <td className="px-5 py-3">
            <Link
              href={`/admin/fests/${fest.id}`}
              className="font-medium text-ink hover:text-brand-mid hover:underline"
            >
              {fest.name}
            </Link>
            {fest.venue ? <span className="block text-xs text-faint">{fest.venue}</span> : null}
          </td>
          <td className="px-5 py-3 text-sm whitespace-nowrap">
            {formatDate(fest.startsAt)} {formatTime(fest.startsAt)}
            <span className="block text-xs text-faint">
              to {formatDate(fest.endsAt)} {formatTime(fest.endsAt)}
            </span>
          </td>
          <td className="px-5 py-3 text-sm capitalize">{fest.category}</td>
          <td className="px-5 py-3">
            <PhaseBadge phase={phaseOf(fest)} />
          </td>
          <td className="px-5 py-3 text-right">
            <Link
              href={`/admin/fests/${fest.id}`}
              className="text-sm font-medium text-brand-mid hover:underline"
            >
              Manage
            </Link>
          </td>
        </Row>
      ))}
    </DataTable>
  );
}

export default async function FestsPage() {
  await requireAdminSession();

  let fests: Fest[] = [];
  let missing = false;

  try {
    fests = await listFests();
  } catch (error) {
    if (error instanceof FestTablesMissing) missing = true;
    else throw error;
  }

  const live = fests.filter((fest) => phaseOf(fest) === 'live').length;
  const upcoming = fests.filter((fest) => phaseOf(fest) === 'upcoming').length;

  return (
    <>
      <PageHeading
        title="Fests & Events"
        description="Run a fest end to end: its gates, the guards on them, who coordinates it, and whose attendance is regularised."
      />

      {missing ? (
        <div className="mb-6">
          <MigrationNotice />
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Live now" value={live} icon={<Radio size={17} />} tone="green" />
        <StatTile label="Upcoming" value={upcoming} icon={<CalendarDays size={17} />} tone="blue" />
        <StatTile label="All fests" value={fests.length} icon={<PartyPopper size={17} />} tone="grey" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        <Card title="Fests" description="Newest first">
          <FestTable fests={fests} />
        </Card>

        <Card title="Create a fest" padded>
          {missing ? (
            <p className="text-sm text-muted">
              <Users size={14} className="mr-1 inline" />
              Available once migration 0109 has been applied.
            </p>
          ) : (
            <CreateFestForm />
          )}
        </Card>
      </div>
    </>
  );
}
