import Link from 'next/link';

import { EVENT_LABELS, type CampusEventType } from '@/lib/types';

export type FilterOption = { value: string; label: string };

export type FilterValues = {
  personId?: string;
  locationId?: string;
  actorId?: string;
  result?: string;
  eventType?: string;
  from?: string;
  to?: string;
};

const selectClass =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none';

function Select({
  name,
  label,
  options,
  value,
  anyLabel,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  value?: string;
  anyLabel: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      <select name={name} defaultValue={value ?? ''} className={selectClass}>
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A plain GET form, so every filtered view has a shareable URL and the back
 * button behaves. No client-side state is involved.
 */
export function EventFilters({
  action,
  values,
  students,
  locations,
  actors,
  results,
  eventTypes,
}: {
  action: string;
  values: FilterValues;
  students: FilterOption[];
  locations: FilterOption[];
  actors: FilterOption[];
  results: string[];
  eventTypes?: CampusEventType[];
}) {
  const hasFilters = Object.values(values).some(Boolean);

  return (
    <form action={action} className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        name="personId"
        label="Student"
        options={students}
        value={values.personId}
        anyLabel="All students"
      />
      <Select
        name="locationId"
        label="Location"
        options={locations}
        value={values.locationId}
        anyLabel="All locations"
      />
      <Select
        name="actorId"
        label="Recorded by"
        options={actors}
        value={values.actorId}
        anyLabel="Anyone"
      />
      <Select
        name="result"
        label="Result"
        options={results.map((result) => ({ value: result, label: result }))}
        value={values.result}
        anyLabel="Any result"
      />

      {eventTypes ? (
        <Select
          name="eventType"
          label="Event"
          options={eventTypes.map((type) => ({ value: type, label: EVENT_LABELS[type] }))}
          value={values.eventType}
          anyLabel="All events"
        />
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">
          From
        </span>
        <input type="date" name="from" defaultValue={values.from ?? ''} className={selectClass} />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">
          To
        </span>
        <input type="date" name="to" defaultValue={values.to ?? ''} className={selectClass} />
      </label>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {hasFilters ? (
          <Link
            href={action}
            className="rounded-md border border-line px-4 py-1.5 text-sm text-muted hover:text-ink"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
