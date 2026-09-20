/*
  The library panel's own date formatting.
 
  lib/format.ts writes "08 Sep 2026" and is what the admin dashboard, the gate
  console and the printed card all use. The library application writes
  08/09/2026. Both are deliberate and neither is wrong, so rather than change
  one set of screens to suit the other, the library keeps its own and says so
  here. The two agree on the thing that actually matters, which is the campus
  time zone.
*/

/**
 * Dates, written one way.
 *
 * Every date in this app is DD/MM/YYYY. That is the format the university
 * writes on paper, and a library screen that disagreed with the form beside it
 * would be read wrong by somebody in a hurry.
 *
 * Two things are pinned deliberately:
 *
 *   The locale. `en-GB` orders the parts day, month, year. Leaving it to the
 *   browser would give an American librarian 09/10/2026 for the tenth of
 *   September, which is not a different style but a different date.
 *
 *   The time zone. These strings are rendered on the server and again in the
 *   browser. If the two disagreed about the zone, a date near midnight would
 *   differ between them and React would report a hydration mismatch. The
 *   campus is in one place, so the zone is that place.
 */

/** The campus. Every date is shown as it was on the clock here. */
export const CAMPUS_TIME_ZONE = 'Asia/Kolkata';

type DateInput = string | number | Date | null | undefined;

/** Shown wherever a date is missing, so a gap never renders as "Invalid Date". */
export const NO_DATE = '—';

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: CAMPUS_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: CAMPUS_TIME_ZONE,
});

/** `24/09/2026`. */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : NO_DATE;
}

/** `03:45 pm`. */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : NO_DATE;
}

/** `24/09/2026, 03:45 pm`. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? `${dateFormatter.format(date)}, ${timeFormatter.format(date)}` : NO_DATE;
}

/**
 * True when the moment falls on today's date at the campus.
 *
 * Compared as formatted day strings rather than by calendar arithmetic,
 * because the answer has to be about the campus's day, not the day in
 * whatever zone the machine happens to be set to.
 */
export function isToday(value: DateInput): boolean {
  const date = toDate(value);
  return date ? dateFormatter.format(date) === dateFormatter.format(new Date()) : false;
}
