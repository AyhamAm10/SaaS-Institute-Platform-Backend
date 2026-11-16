import { ClosureScope } from '@prisma/client';
import {
  ClosureInfo,
  closedGroupsOn,
  closureCovers,
  findCovering,
} from './closures.rules';

const make = (over: Partial<ClosureInfo>): ClosureInfo => ({
  id: 1,
  scope: ClosureScope.INSTITUTE,
  branchId: null,
  fromDate: '2026-11-10',
  toDate: '2026-11-12',
  reason: 'عطلة',
  sectionIds: [],
  ...over,
});

describe('closureCovers', () => {
  it('covers every student of the institute on the days of an institute closure', () => {
    const c = make({});
    expect(closureCovers(c, '2026-11-10', {})).toBe(true);
    expect(closureCovers(c, '2026-11-12', {})).toBe(true);
    expect(closureCovers(c, '2026-11-09', {})).toBe(false);
    expect(closureCovers(c, '2026-11-13', {})).toBe(false);
  });

  it('covers only the students of the branch for a branch closure', () => {
    const c = make({ scope: ClosureScope.BRANCH, branchId: 4 });
    expect(closureCovers(c, '2026-11-11', { branchId: 4 })).toBe(true);
    expect(closureCovers(c, '2026-11-11', { branchId: 5 })).toBe(false);
    expect(closureCovers(c, '2026-11-11', {})).toBe(false);
  });

  it('covers only students of the listed sections for a section closure', () => {
    const c = make({ scope: ClosureScope.SECTION, sectionIds: [7, 8] });
    expect(closureCovers(c, '2026-11-11', { sectionIds: [8, 9] })).toBe(true);
    expect(closureCovers(c, '2026-11-11', { sectionIds: [9] })).toBe(false);
    expect(closureCovers(c, '2026-11-11', { branchId: 4 })).toBe(false);
  });
});

describe('findCovering / closedGroupsOn', () => {
  const closures = [
    make({ id: 1, scope: ClosureScope.BRANCH, branchId: 4 }),
    make({ id: 2, scope: ClosureScope.SECTION, sectionIds: [7] }),
    make({ id: 3, fromDate: '2026-12-01', toDate: '2026-12-01' }),
  ];

  it('finds the first closure that applies', () => {
    expect(findCovering(closures, '2026-11-11', { branchId: 4 })?.id).toBe(1);
    expect(findCovering(closures, '2026-11-11', { sectionIds: [7] })?.id).toBe(2);
    expect(findCovering(closures, '2026-11-11', { branchId: 9 })).toBeNull();
  });

  it('groups what a day excludes from absence marking', () => {
    expect(closedGroupsOn(closures, '2026-11-11')).toEqual({
      all: false,
      branchIds: [4],
      sectionIds: [7],
    });
    expect(closedGroupsOn(closures, '2026-12-01').all).toBe(true);
    expect(closedGroupsOn(closures, '2026-11-20')).toEqual({
      all: false,
      branchIds: [],
      sectionIds: [],
    });
  });
});
