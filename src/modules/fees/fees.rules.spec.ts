import {
  addMonths,
  allocateFifo,
  buildSchedule,
  installmentStatus,
  OpenInstallment,
} from './fees.rules';
import {
  convertToContractMinor,
  hasValidPrecision,
  minorToDecimal,
  toMinor,
} from '../../common/money/money';

describe('money helpers', () => {
  it('uses whole SYP and two-decimal USD', () => {
    expect(toMinor(1500, 'SYP')).toBe(1500);
    expect(toMinor('12.34', 'USD')).toBe(1234);
    expect(toMinor(0.29, 'USD')).toBe(29);
    expect(hasValidPrecision(10.5, 'SYP')).toBe(false);
    expect(hasValidPrecision(10.555, 'USD')).toBe(false);
    expect(minorToDecimal(1234, 'USD').toString()).toBe('12.34');
  });

  it('converts with the SYP-per-USD rate, rounded to the contract currency', () => {
    expect(convertToContractMinor(10, 'USD', 'SYP', 13000)).toBe(130000);
    expect(convertToContractMinor(100000, 'SYP', 'USD', 13000)).toBe(769); // 7.69 USD
    expect(convertToContractMinor(5, 'USD', 'USD')).toBe(500);
    expect(() => convertToContractMinor(5, 'USD', 'SYP')).toThrow();
  });
});

describe('fees rules', () => {
  it('adds months clamped to the month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('splits the total monthly and puts the rounding remainder on the last one', () => {
    const lines = buildSchedule({
      totalMinor: 1000,
      count: 3,
      startDate: '2026-09-01',
    });
    expect(lines.map((l) => l.amountMinor)).toEqual([333, 333, 334]);
    expect(lines.map((l) => l.dueDate)).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
    expect(lines.map((l) => l.installmentNumber)).toEqual([1, 2, 3]);
  });

  it('makes the first payment installment #1 due on the start date', () => {
    const lines = buildSchedule({
      totalMinor: 1_500_000,
      firstPaymentMinor: 300_000,
      count: 4,
      startDate: '2026-09-10',
    });
    expect(lines[0]).toEqual({
      installmentNumber: 1,
      amountMinor: 300_000,
      dueDate: '2026-09-10',
    });
    expect(lines.slice(1).map((l) => l.dueDate)).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
    ]);
    expect(lines.reduce((s, l) => s + l.amountMinor, 0)).toBe(1_500_000);
  });

  const open = (over: Partial<OpenInstallment>[]): OpenInstallment[] =>
    over.map((o, i) => ({
      id: i + 1,
      installmentNumber: i + 1,
      dueDate: `2026-0${i + 1}-01`,
      amountMinor: 100,
      paidMinor: 0,
      ...o,
    }));

  it('allocates FIFO by due date, skipping paid installments', () => {
    const insts = open([{ paidMinor: 100 }, { paidMinor: 40 }, {}, {}]);
    expect(allocateFifo(insts, 130)).toEqual([
      { installmentId: 2, amountMinor: 60 },
      { installmentId: 3, amountMinor: 70 },
    ]);
  });

  it('orders by due date even when numbers are out of order', () => {
    const insts = open([{ dueDate: '2026-05-01' }, { dueDate: '2026-02-01' }]);
    expect(allocateFifo(insts, 50)).toEqual([
      { installmentId: 2, amountMinor: 50 },
    ]);
  });

  it('refuses a payment larger than the remaining balance', () => {
    expect(allocateFifo(open([{ paidMinor: 50 }, {}]), 151)).toBeNull();
    expect(allocateFifo(open([{ paidMinor: 50 }, {}]), 150)).not.toBeNull();
  });

  it('derives the installment status', () => {
    expect(installmentStatus(100, 100, '2026-01-01', '2026-06-01')).toBe(
      'PAID',
    );
    expect(installmentStatus(100, 40, '2026-01-01', '2026-06-01')).toBe(
      'OVERDUE',
    );
    expect(installmentStatus(100, 40, '2026-07-01', '2026-06-01')).toBe(
      'PARTIAL',
    );
    expect(installmentStatus(100, 0, '2026-06-01', '2026-06-01')).toBe(
      'PENDING',
    );
  });
});
