import { buildStudentFinance } from './student-finance';

const inst = (id: number, number: number, dueDate: string, amount: number, paid: number, status = 'PENDING') =>
  ({ id, installmentNumber: number, dueDate: new Date(`${dueDate}T00:00:00Z`), amount, paidAmount: paid, status }) as any;

const contract = (id: number, currency: string, total: number, installments: any[], extra: object = {}) =>
  ({
    id,
    currency,
    totalAmount: total,
    discountAmount: 0,
    status: 'ACTIVE',
    academicYear: { id: 1, name: '2026-2027' },
    installments,
    payments: [],
    ...extra,
  }) as any;

describe('buildStudentFinance', () => {
  const today = '2026-11-08';

  it('no contracts: everything empty', () => {
    expect(buildStudentFinance([], today, 'Asia/Damascus')).toEqual({
      totals: [],
      contracts: [],
      payments: [],
      nextDue: null,
    });
  });

  it('contract without installments has zero paid and full remaining', () => {
    const f = buildStudentFinance([contract(1, 'SYP', 1000, [])], today, 'Asia/Damascus');
    expect(f.contracts[0]).toMatchObject({ total: 1000, paid: 0, remaining: 1000, installments: [] });
    expect(f.nextDue).toBeNull();
  });

  it('keeps currencies apart, computes statuses against today and the next due installment', () => {
    const f = buildStudentFinance(
      [
        contract(1, 'SYP', 3000, [
          inst(1, 1, '2026-10-01', 1000, 1000, 'PAID'),
          inst(2, 2, '2026-11-01', 1000, 400),
          inst(3, 3, '2026-12-01', 1000, 0),
        ]),
        contract(2, 'USD', 100.5, [inst(4, 1, '2026-11-20', 100.5, 0.25)]),
      ],
      today,
      'Asia/Damascus',
    );
    expect(f.contracts[0].installments.map((i) => i.status)).toEqual(['PAID', 'OVERDUE', 'PENDING']);
    expect(f.contracts[1].installments[0].status).toBe('PARTIAL');
    expect(f.totals).toEqual([
      { currency: 'SYP', total: 3000, paid: 1400, remaining: 1600, overdue: 600 },
      { currency: 'USD', total: 100.5, paid: 0.25, remaining: 100.25, overdue: 0 },
    ]);
    expect(f.nextDue).toEqual({ amount: 600, currency: 'SYP', dueDate: '2026-11-01' });
  });

  it('cancelled contracts are not listed or totalled; payments newest first with local date', () => {
    const pay = (id: number, receipt: number, at: string, status = 'ACTIVE') => ({
      id, receiptNumber: receipt, paidAt: new Date(at), amount: 500, currency: 'SYP', paymentMethod: 'CASH', status,
    });
    const f = buildStudentFinance(
      [
        contract(1, 'SYP', 1000, [], {
          payments: [pay(1, 1, '2026-09-01T10:00:00Z'), pay(2, 2, '2026-10-31T22:30:00Z', 'CANCELLED')],
        }),
        contract(2, 'SYP', 500, [], { status: 'CANCELLED' }),
      ],
      today,
      'Asia/Damascus',
    );
    expect(f.contracts).toHaveLength(1);
    expect(f.totals[0].total).toBe(1000);
    expect(f.payments.map((p) => p.id)).toEqual([2, 1]);
    expect(f.payments[0]).toMatchObject({ date: '2026-11-01', status: 'CANCELLED', method: 'CASH' });
  });
});
