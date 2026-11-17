import { jest } from '@jest/globals';
import { StudentReports } from './student.reports';

const student = (fullName: string, bus: object | null, section = 'شعبة أ') => ({
  fullName,
  bus,
  family: { familyName: 'عائلة', phone: '0911' },
  studentEnrollments: [{ section: { name: section } }],
});

describe('StudentReports bus roster', () => {
  const run = async (data: object[]) => {
    const students = { findAll: jest.fn<any>().mockResolvedValue({ data }) };
    const reports = new StudentReports(students as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const ctx = { query: { busId: undefined }, today: '2026-11-30', timeZone: 'Asia/Damascus' } as never;
    return (reports.builders['bus-roster'] as (c: never) => Promise<any>)(ctx);
  };

  it('groups the students by bus with the driver and the head count in the title', async () => {
    const north = { id: 1, name: 'باص الشمال', plateNumber: '123', driverName: 'أبو علي', driverPhone: '0944' };
    const south = { id: 2, name: 'باص الجنوب', plateNumber: null, driverName: null, driverPhone: null };
    const body = await run([
      student('سامي', north),
      student('أحمد', north),
      student('ليلى', south),
      student('بلا باص', null),
    ]);
    const tables = body.blocks.filter((b: any) => b.type === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[0].title).toBe('باص الشمال · السائق: أبو علي · الهاتف: 0944 · اللوحة: 123 · الركاب: 2');
    expect(tables[0].rows.map((r: any) => r.student)).toEqual(['أحمد', 'سامي']);
    expect(tables[1].title).toBe('باص الجنوب · الركاب: 1');
    const stats = body.blocks.find((b: any) => b.type === 'stats').items;
    expect(stats.map((s: any) => s.value)).toEqual([2, 3]);
  });

  it('says so when nobody rides a bus', async () => {
    const body = await run([student('بلا باص', null)]);
    expect(body.blocks.find((b: any) => b.type === 'table').emptyText).toBe('لا طلاب مسجلون بباص');
  });
});
