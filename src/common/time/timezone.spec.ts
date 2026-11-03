import { dateOnly, getLocalParts, timeToMinutes } from './timezone';

describe('timezone helpers', () => {
  it('returns the local date in Damascus around UTC midnight', () => {
    // 22:30 UTC on Nov 2 is already 01:30 on Nov 3 in Damascus (UTC+3)
    const parts = getLocalParts(
      new Date('2026-11-02T22:30:00Z'),
      'Asia/Damascus',
    );

    expect(parts.date).toBe('2026-11-03');
    expect(parts.minutesOfDay).toBe(90);
    expect(parts.dayOfWeek).toBe(2); // Tuesday
  });

  it('keeps the previous local date for western time zones', () => {
    const parts = getLocalParts(
      new Date('2026-11-03T02:00:00Z'),
      'America/New_York',
    );

    expect(parts.date).toBe('2026-11-02');
  });

  it('converts HH:mm and date-only strings', () => {
    expect(timeToMinutes('08:15')).toBe(495);
    expect(dateOnly('2026-11-03').toISOString()).toBe(
      '2026-11-03T00:00:00.000Z',
    );
  });
});
