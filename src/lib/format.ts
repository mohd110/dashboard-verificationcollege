/**
 * All timestamps are stored with their offset and shown in campus time, so a
 * trail reads the same whoever opens it and wherever they are.
 */
const CAMPUS_TIME_ZONE = 'Asia/Kolkata';

/*
  Dates are assembled by hand rather than handed to a locale.
  Intl month abbreviations move between ICU versions, so "08 Sep 2026" can
  become "08 Sept 2026" after a Node upgrade. The activity trail, the printed
  formats and the emails all have to agree, and a silent change of shape would
  be hard to notice.
*/
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const campusParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPUS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

type CampusClock = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function campusClock(iso: string): CampusClock {
  const parts = campusParts.formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Midnight comes back as "24" in some ICU builds.
    hour: read('hour') === '24' ? '00' : read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

export function formatTime(iso: string): string {
  const clock = campusClock(iso);
  return `${clock.hour}:${clock.minute}`;
}

export function formatDate(iso: string): string {
  const clock = campusClock(iso);
  return `${clock.day} ${MONTHS[Number(clock.month) - 1]} ${clock.year}`;
}

export function formatDateTime(iso: string): string {
  const clock = campusClock(iso);
  return `${formatDate(iso)}, ${clock.hour}:${clock.minute}:${clock.second}`;
}

/** Today on campus, as yyyy-mm-dd, for day filters and "today" counters. */
export function campusToday(now: Date = new Date()): string {
  const clock = campusClock(now.toISOString());
  return `${clock.year}-${clock.month}-${clock.day}`;
}
