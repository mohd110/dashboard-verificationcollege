import { describe, expect, it } from 'vitest';

import { campusToday, formatDate, formatTime } from '../format';

describe('campus time formatting', () => {
  // 06:02 UTC is 11:32 in campus time, and the day rolls over at 18:30 UTC.
  const morning = '2026-09-08T06:02:00Z';
  const lateEvening = '2026-09-08T19:15:00Z';

  it('shows the time on campus, not the viewer time', () => {
    expect(formatTime(morning)).toBe('11:32');
  });

  it('rolls the date over at campus midnight', () => {
    expect(formatDate(morning)).toBe('08 Sep 2026');
    expect(formatDate(lateEvening)).toBe('09 Sep 2026');
  });

  it('reports today as the campus day', () => {
    expect(campusToday(new Date(lateEvening))).toBe('2026-09-09');
  });
});
