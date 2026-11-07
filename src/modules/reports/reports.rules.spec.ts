import {
  agingBucket,
  average,
  daysBetween,
  markDistribution,
  monthKeysBetween,
  nextWorkingDays,
  percent,
  rankByScore,
  resolvePeriod,
  sumByCurrency,
} from './reports.rules';

describe('reports.rules', () => {
  it('resolvePeriod defaults to the last 30 days and orders the ends', () => {
    expect(resolvePeriod('2026-11-07')).toEqual({ from: '2026-10-08', to: '2026-11-07' });
    expect(resolvePeriod('2026-11-07', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-12-01' });
    expect(resolvePeriod('2026-11-07', '2026-11-05', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-05' });
  });

  it('daysBetween and agingBucket', () => {
    expect(daysBetween('2026-10-31', '2026-11-07')).toBe(7);
    expect(agingBucket('2026-11-01', '2026-11-07')).toBe('1-30');
    expect(agingBucket('2026-09-20', '2026-11-07')).toBe('31-60');
    expect(agingBucket('2026-08-20', '2026-11-07')).toBe('61-90');
    expect(agingBucket('2026-01-01', '2026-11-07')).toBe('90+');
  });

  it('sumByCurrency never mixes currencies and keeps precision', () => {
    const sums = sumByCurrency([
      { amount: '0.10', currency: 'USD' },
      { amount: '0.20', currency: 'USD' },
      { amount: 1500, currency: 'SYP' },
    ]);
    expect(sums.get('USD')).toBe(0.3);
    expect(sums.get('SYP')).toBe(1500);
  });

  it('percent', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
  });

  it('rankByScore uses competition ranking and puts null last', () => {
    const ranked = rankByScore([
      { id: 1, score: 80 },
      { id: 2, score: null },
      { id: 3, score: 95 },
      { id: 4, score: 80 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      [3, 1],
      [1, 2],
      [4, 2],
      [2, null],
    ]);
  });

  it('markDistribution bands', () => {
    expect(markDistribution([10, 49.9, 50, 65, 79, 85, 90, 100])).toEqual([2, 1, 1, 1, 1, 2]);
  });

  it('nextWorkingDays skips days off', () => {
    // 2026-11-06 is a Friday (5), 2026-11-07 a Saturday (6)
    expect(nextWorkingDays('2026-11-05', 3, [0, 1, 2, 3, 4])).toEqual(['2026-11-05', '2026-11-08', '2026-11-09']);
    expect(nextWorkingDays('2026-11-05', 3, [])).toEqual([]);
  });

  it('monthKeysBetween crosses years', () => {
    expect(monthKeysBetween('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('average', () => {
    expect(average([1, 2, 2])).toBe(1.67);
    expect(average([])).toBeNull();
  });
});
