import { buildTimetable, lessonsOfDay } from './teacher-schedule';

const entry = (over: object) => ({
  id: 1,
  dayOfWeek: 6,
  periodNumber: 1,
  startTime: '08:00',
  endTime: '08:45',
  timetable: { section: { id: 3, name: 'التاسع أ' } },
  subject: { id: 5, name: 'الرياضيات' },
  teacher: null,
  room: { name: 'قاعة 1' },
  ...over,
});

describe('teacher schedule helpers', () => {
  it('sorts the lessons of a day by time and keeps the section, subject and room', () => {
    const lessons = lessonsOfDay(
      [
        entry({ id: 2, startTime: '09:30', endTime: '10:15' }),
        entry({ id: 1 }),
        entry({ id: 3, dayOfWeek: 0 }),
      ] as never,
      6,
    );
    expect(lessons.map((l) => l.id)).toEqual([1, 2]);
    expect(lessons[0]).toEqual(
      expect.objectContaining({
        sectionId: 3,
        sectionName: 'التاسع أ',
        subjectId: 5,
        subjectName: 'الرياضيات',
        room: 'قاعة 1',
      }),
    );
  });

  it('builds the working days in institute order, Saturday first, with empty days kept', () => {
    const timetable = buildTimetable(
      [entry({ id: 1 }), entry({ id: 2, dayOfWeek: 1 })] as never,
      [0, 1, 2, 3, 4, 6], // Friday is not a working day
      [{ name: 'استراحة', startTime: '10:15', endTime: '10:45' }],
      7,
    );
    expect(timetable.days.map((d) => d.weekday)).toEqual([
      'SATURDAY',
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
    ]);
    expect(timetable.days[0].lessons).toHaveLength(1);
    expect(timetable.days[1].lessons).toHaveLength(0);
    expect(timetable.days[2].lessons).toHaveLength(1);
    expect(timetable.breaks).toHaveLength(1);
    expect(timetable.academicYearId).toBe(7);
  });

  it('has a room of null when the lesson has none', () => {
    expect(lessonsOfDay([entry({ room: null })] as never, 6)[0].room).toBeNull();
  });
});
