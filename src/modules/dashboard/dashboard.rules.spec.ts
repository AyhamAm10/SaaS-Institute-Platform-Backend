import {
  attendanceRate,
  attendanceSeries,
  lastWorkingDays,
} from '../attendance/attendance.rules';
import { collectionsByMonth, lastMonthKeys } from '../fees/fees.rules';
import { weightedAveragePercent } from '../exams/exams.rules';
import { sectionRows, todayAttendance } from './dashboard.rules';

// Saturday → Thursday; 2026-11-06 is a Friday
const WORKING = [6, 0, 1, 2, 3, 4];

describe('attendance overview rules', () => {
  it('computes a rate with one decimal and null without a base', () => {
    expect(attendanceRate(2, 3)).toBe(66.7);
    expect(attendanceRate(0, 0)).toBeNull();
  });

  it('takes the last working days, skipping the weekend, oldest first', () => {
    // Sunday 8 (today) and Saturday 7 count; Friday 6 is skipped
    expect(lastWorkingDays('2026-11-08', 3, WORKING)).toEqual([
      '2026-11-05',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(lastWorkingDays('2026-11-08', 3, [])).toEqual([]);
  });

  it('builds one point per day from (date, status) counts', () => {
    const series = attendanceSeries(
      [
        { date: '2026-11-04', status: 'PRESENT', count: 3 },
        { date: '2026-11-04', status: 'LATE', count: 1 },
        { date: '2026-11-04', status: 'ABSENT', count: 4 },
      ],
      ['2026-11-04', '2026-11-05'],
    );
    expect(series[0]).toEqual({
      date: '2026-11-04',
      dayOfWeek: 3,
      attended: 4,
      recorded: 8,
      rate: 50,
    });
    expect(series[1].rate).toBeNull();
  });
});

describe('finance overview rules', () => {
  it('lists the last month keys across a year boundary', () => {
    expect(lastMonthKeys('2027-02-15', 4)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('sums collections per month and currency, never mixing currencies', () => {
    const rows = collectionsByMonth(
      [
        { month: '2026-11', currency: 'SYP', amountMinor: 100 },
        { month: '2026-11', currency: 'SYP', amountMinor: 50 },
        { month: '2026-10', currency: 'USD', amountMinor: 2500 },
        { month: '2026-01', currency: 'USD', amountMinor: 999 }, // outside window
      ],
      ['2026-10', '2026-11'],
    );
    expect(rows).toEqual([
      { month: '2026-10', currency: 'SYP', amountMinor: 0 },
      { month: '2026-11', currency: 'SYP', amountMinor: 150 },
      { month: '2026-10', currency: 'USD', amountMinor: 2500 },
      { month: '2026-11', currency: 'USD', amountMinor: 0 },
    ]);
  });
});

describe('exams overview rules', () => {
  it('weights the exam averages by the number of graded marks', () => {
    // 80% on 1 mark, 40% on 3 marks → 50%
    expect(
      weightedAveragePercent([
        { averageMark: 16, graded: 1, maxMark: 20 },
        { averageMark: 40, graded: 3, maxMark: 100 },
        { averageMark: null, graded: 0, maxMark: 100 },
      ]),
    ).toBe(50);
    expect(weightedAveragePercent([])).toBeNull();
  });
});

describe('dashboard composition', () => {
  const records = [
    { studentId: 1, status: 'PRESENT' as const },
    { studentId: 2, status: 'LATE' as const },
    { studentId: 3, status: 'ABSENT' as const },
    { studentId: 99, status: 'PRESENT' as const }, // not active this year
  ];

  it("counts today over active students only, with 'not recorded'", () => {
    expect(todayAttendance([1, 2, 3, 4], records, true)).toEqual({
      present: 1,
      late: 1,
      absent: 1,
      excused: 0,
      notRecorded: 1,
      rate: 50,
    });
    expect(todayAttendance([1, 2], records, false).rate).toBeNull();
  });

  it('builds one row per section, empty sections included', () => {
    const rows = sectionRows(
      [
        { id: 10, name: 'أ' },
        { id: 11, name: 'ب' },
      ],
      [
        { studentId: 1, sectionId: 10 },
        { studentId: 2, sectionId: 10 },
        { studentId: 3, sectionId: 10 },
      ],
      records,
      new Map([[10, 72.5]]),
    );
    expect(rows).toEqual([
      {
        id: 10,
        name: 'أ',
        students: 3,
        attendedToday: 2,
        averagePercent: 72.5,
      },
      {
        id: 11,
        name: 'ب',
        students: 0,
        attendedToday: 0,
        averagePercent: null,
      },
    ]);
  });
});
