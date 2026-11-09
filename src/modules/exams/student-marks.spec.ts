import { buildMarksView } from './student-marks';

const row = (id: number, subjectId: number, date: string, mark: number | null, max = 100, status = 'PASSED') => ({
  mark,
  status,
  exam: {
    id,
    title: `E${id}`,
    examDate: new Date(`${date}T00:00:00Z`),
    maxMark: max,
    subject: { id: subjectId, name: `S${subjectId}` },
  },
});

describe('buildMarksView', () => {
  it('no results gives null average and no subjects', () => {
    expect(buildMarksView([])).toEqual({ averagePercent: null, subjects: [] });
  });

  it('groups by subject, newest first, one-decimal percent, ungraded excluded from averages', () => {
    const v = buildMarksView([
      row(1, 1, '2026-10-01', 50),
      row(2, 1, '2026-10-10', 75, 100),
      row(3, 2, '2026-10-05', 17, 20),
      row(4, 2, '2026-10-06', null, 20, 'PENDING'),
    ]);
    const s1 = v.subjects.find((s) => s.subjectId === 1)!;
    const s2 = v.subjects.find((s) => s.subjectId === 2)!;
    expect(s1.results.map((r) => r.examId)).toEqual([2, 1]);
    expect(s1.averagePercent).toBe(62.5);
    expect(s2.averagePercent).toBe(85);
    expect(s2.results.find((r) => r.examId === 4)).toMatchObject({ score: null, percent: null, status: 'PENDING' });
    expect(v.averagePercent).toBe(70);
  });
});
