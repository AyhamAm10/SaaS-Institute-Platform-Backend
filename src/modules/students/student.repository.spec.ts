import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { StudentRepository } from './student.repository';

describe('StudentRepository', () => {
  const ctx = {
    userId: 1,
    instituteId: 3,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
    branchId: 2,
    academicYearId: 9,
  };

  const delegate = () => ({
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
  });

  let prisma: { student: ReturnType<typeof delegate> };
  let repo: StudentRepository;

  beforeEach(() => {
    prisma = { student: delegate() };
    repo = new StudentRepository(prisma as never);
  });

  const whereOf = (mock: ReturnType<typeof delegate>['findMany']) =>
    (mock.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

  it('lists students of the context year plus new students never enrolled', async () => {
    await RequestContext.run(ctx, () =>
      repo.findFiltered({ page: 1, limit: 10 }, 9),
    );

    const where = whereOf(prisma.student.findMany);
    expect(where).toMatchObject({
      instituteId: 3,
      branchId: 2,
      AND: [
        {
          OR: [
            { studentEnrollments: { some: { academicYearId: 9 } } },
            { studentEnrollments: { none: {} } },
          ],
        },
      ],
    });
  });

  it('filters by sectionId when provided', async () => {
    await RequestContext.run(ctx, () =>
      repo.findFiltered({ page: 1, limit: 10, sectionId: 15 }, 9),
    );

    const where = whereOf(prisma.student.findMany);
    expect(where).toMatchObject({
      instituteId: 3,
      branchId: 2,
      AND: [{ studentEnrollments: { some: { sectionId: 15 } } }],
    });
  });

  it('filters for unassigned students in the context year', async () => {
    await RequestContext.run(ctx, () =>
      repo.findFiltered({ page: 1, limit: 10, unassigned: true }, 9),
    );

    const where = whereOf(prisma.student.findMany);
    expect(where).toMatchObject({
      instituteId: 3,
      branchId: 2,
      AND: [{ studentEnrollments: { none: { academicYearId: 9 } } }],
    });
  });

  it('falls back to all branch students when contextYearId is null', async () => {
    await RequestContext.run(ctx, () =>
      repo.findFiltered({ page: 1, limit: 10 }, null),
    );

    const where = whereOf(prisma.student.findMany);
    expect(where).toMatchObject({
      instituteId: 3,
      branchId: 2,
    });
    expect(where['AND']).toBeUndefined();
  });
});

