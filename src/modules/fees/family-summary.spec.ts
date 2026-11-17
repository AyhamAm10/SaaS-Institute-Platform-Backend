import { FeesReportsService } from './fees-reports.service';

const inst = (id: number, due: string, amount: number, paid: number) =>
  ({ id, installmentNumber: id, dueDate: new Date(`${due}T00:00:00Z`), amount, paidAmount: paid, status: 'PENDING' }) as any;

const contract = (id: number, student: { id: number; fullName: string }, currency: string, installments: any[]) =>
  ({
    id,
    student,
    currency,
    totalAmount: installments.reduce((s, i) => s + i.amount, 0),
    section: { id: 1, name: 'شعبة' },
    discountAmount: 0,
    status: 'ACTIVE',
    academicYear: { id: 1, name: '2026-2027' },
    installments,
    payments: [],
  }) as any;

describe('FeesReportsService.getFamilySummary', () => {
  it('sums the children per currency and keeps one summary per child', async () => {
    const a = { id: 1, fullName: 'أ' };
    const b = { id: 2, fullName: 'ب' };
    const subscriptions = {
      findByFamily: async () => [
        contract(1, a, 'SYP', [inst(1, '2026-12-01', 100, 40)]),
        contract(2, b, 'SYP', [inst(2, '2026-12-01', 50, 0)]),
        contract(3, b, 'USD', [inst(3, '2026-12-01', 20, 20)]),
      ],
    };
    const clock = { today: async () => '2026-11-08' };
    const service = new FeesReportsService(subscriptions as any, {} as any, {} as any, clock as any, {} as any);

    const result = await service.getFamilySummary(7);

    const syp = result.totals.find((t) => t.currency === 'SYP');
    expect(syp).toMatchObject({ total: 150, paid: 40, remaining: 110 });
    expect(result.totals.find((t) => t.currency === 'USD')).toMatchObject({ total: 20, remaining: 0 });
    expect(result.students.map((s) => s.studentId)).toEqual([1, 2]);
    // The fully paid USD contract is not offered for a new payment
    expect(result.openContracts.map((c) => [c.contractId, c.remaining])).toEqual([
      [1, 60],
      [2, 50],
    ]);
    expect(result.students[1].summary).toHaveLength(2);
  });

  it('is empty for a family without contracts', async () => {
    const service = new FeesReportsService(
      { findByFamily: async () => [] } as any,
      {} as any,
      {} as any,
      { today: async () => '2026-11-08' } as any,
      {} as any,
    );
    expect(await service.getFamilySummary(7)).toEqual({ totals: [], openContracts: [], students: [] });
  });
});
