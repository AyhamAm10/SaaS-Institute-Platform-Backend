import { FilterBuilder } from './filter-builder';

describe('FilterBuilder', () => {
  it('constructs Prisma-compatible where object with various operations', () => {
    const where = new FilterBuilder()
      .contains('fullName', 'John')
      .equals('isActive', true)
      .in('role', ['TEACHER', 'ADMIN'])
      .range('feeAmount', 100, 500)
      .startsWith('code', 'SEC')
      .build();

    expect(where).toEqual({
      fullName: { contains: 'John', mode: 'insensitive' },
      isActive: true,
      role: { in: ['TEACHER', 'ADMIN'] },
      feeAmount: { gte: 100, lte: 500 },
      code: { startsWith: 'SEC', mode: 'insensitive' },
    });
  });

  it('ignores undefined/null fields cleanly', () => {
    const where = new FilterBuilder()
      .contains('fullName', undefined)
      .equals('isActive', null)
      .in('role', [])
      .build();

    expect(where).toEqual({});
  });
});
