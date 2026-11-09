import { buildTimetable, lessonsOfDay } from './mobile-timetable';

const entry = (id: number, dayOfWeek: number, startTime: string, subject: string) =>
  ({
    id,
    dayOfWeek,
    periodNumber: null,
    startTime,
    endTime: '09:00',
    timetable: { section: { id: 1, name: 'A' } },
    subject: { id, name: subject },
    teacher: { id: 1, user: { fullName: 'T' } },
    room: null,
  }) as any;

describe('mobile timetable shaping', () => {
  it('returns working days only, Saturday first, slots sorted, null for a missing room', () => {
    const t = buildTimetable(
      [entry(1, 0, '10:00', 'Math'), entry(2, 0, '08:00', 'Arabic'), entry(3, 5, '08:00', 'Off day')],
      [6, 0, 1],
    );
    expect(t.days.map((d) => d.weekday)).toEqual(['SATURDAY', 'SUNDAY', 'MONDAY']);
    expect(t.days[1].slots.map((s) => s.subject)).toEqual(['Arabic', 'Math']);
    expect(t.days[1].slots[0].room).toBeNull();
    expect(t.days[0].slots).toEqual([]);
  });

  it('empty when there are no working days', () => {
    expect(buildTimetable([], [])).toEqual({ days: [] });
  });

  it('lessons of a day', () => {
    const lessons = lessonsOfDay([entry(1, 2, '08:00', 'Math'), entry(2, 3, '08:00', 'X')], 2);
    expect(lessons).toEqual([
      { id: 1, subject: 'Math', startTime: '08:00', endTime: '09:00', room: null, teacher: 'T' },
    ]);
  });
});
