import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { MobileContextService } from './mobile-context.service';

const child = (branchId: number, enrollment: { id: number; academicYearId: number } | null) =>
  ({
    id: 1,
    branchId,
    studentEnrollments: enrollment
      ? [{ ...enrollment, sectionId: 4, section: { id: 4, name: 'A' } }]
      : [],
  }) as any;

describe('MobileContextService (context establishment)', () => {
  let years: any;
  let service: MobileContextService;

  const request = <T>(fn: () => Promise<T>) =>
    RequestContext.run(
      { userId: 7, instituteId: 3, role: 'FAMILY', language: 'ar', branchId: 55, academicYearId: 66 },
      fn,
    );

  beforeEach(() => {
    years = { findCurrentYearId: jest.fn(async () => 20) };
    service = new MobileContextService(years);
  });

  it('branch = student branch, year = active enrollment year', async () => {
    const seen = await request(() =>
      service.runFor(child(2, { id: 9, academicYearId: 11 }), async () => ({
        b: RequestContext.getBranchId(),
        y: RequestContext.getAcademicYearId(),
        i: RequestContext.getInstituteId(),
      })),
    );
    expect(seen).toEqual({ b: 2, y: 11, i: 3 });
    expect(years.findCurrentYearId).not.toHaveBeenCalled();
  });

  it('without enrollment falls back to the institute current year', async () => {
    const seen = await request(() =>
      service.runFor(child(2, null), async (scope) => ({ y: RequestContext.getAcademicYearId(), scope })),
    );
    expect(seen.y).toBe(20);
    expect(seen.scope.enrollment).toBeNull();
  });

  it('without enrollment and without a current year the year is null / unset', async () => {
    years.findCurrentYearId.mockResolvedValue(null);
    const seen = await request(() =>
      service.runFor(child(2, null), async (scope) => ({ y: RequestContext.getAcademicYearId(), scope })),
    );
    expect(seen.y).toBeUndefined();
    expect(seen.scope.academicYearId).toBeNull();
  });

  it('children of different branches get different contexts and the request context is not touched', async () => {
    const result = await request(async () => {
      const a = await service.runFor(child(1, { id: 1, academicYearId: 10 }), async () => RequestContext.getBranchId());
      const b = await service.runFor(child(2, { id: 2, academicYearId: 12 }), async () => RequestContext.getBranchId());
      return { a, b, after: RequestContext.getBranchId(), language: RequestContext.getLanguage() };
    });
    expect(result).toEqual({ a: 1, b: 2, after: 55, language: 'ar' });
  });

  it('runNeutral drops client-sent branch / year but keeps the institute', async () => {
    const seen = await request(async () =>
      service.runNeutral(() => ({
        b: RequestContext.getBranchId(),
        y: RequestContext.getAcademicYearId(),
        i: RequestContext.getInstituteId(),
      })),
    );
    expect(seen).toEqual({ b: undefined, y: undefined, i: 3 });
  });
});
