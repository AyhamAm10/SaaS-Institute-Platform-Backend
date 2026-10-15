import { jest } from '@jest/globals';
import { ContextScopedRepository } from './context-scoped.repository';
import { RequestContext } from '../context/request-context';
import { PrismaService } from './prisma.service';

interface MockSection {
  id: number;
  instituteId: number;
  branchId: number;
  academicYearId: number;
  name: string;
}

interface MockHomework {
  id: number;
  instituteId: number;
  sectionId: number;
  title: string;
  section?: {
    academicYearId: number;
    branchId: number;
  };
}

class MockSectionRepository extends ContextScopedRepository<MockSection> {
  protected override readonly yearKey = 'academicYearId';
  protected override readonly branchKey = 'branchId';

  constructor(prisma: PrismaService) {
    super(prisma, 'mockSection');
  }
}

class MockHomeworkRepository extends ContextScopedRepository<MockHomework> {
  protected override readonly yearKey = 'section.academicYearId';
  protected override readonly branchKey = 'section.branchId';

  constructor(prisma: PrismaService) {
    super(prisma, 'mockHomework');
  }
}

describe('ContextScopedRepository', () => {
  let mockPrisma: any;
  let sectionRepo: MockSectionRepository;
  let homeworkRepo: MockHomeworkRepository;

  beforeEach(() => {
    mockPrisma = {
      mockSection: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      mockHomework: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    sectionRepo = new MockSectionRepository(mockPrisma);
    homeworkRepo = new MockHomeworkRepository(mockPrisma);
  });

  describe('When operational headers are NOT provided', () => {
    it('scopes strictly to instituteId (identical to TenantAwareRepository)', async () => {
      mockPrisma.mockSection.findMany.mockResolvedValue([]);

      await RequestContext.run(
        { userId: 1, instituteId: 9, role: 'ADMIN', language: 'ar' },
        async () => {
          await sectionRepo.findMany({ where: { name: 'Section A' } });

          expect(mockPrisma.mockSection.findMany).toHaveBeenCalledWith({
            where: { name: 'Section A', instituteId: 9 },
          });
        },
      );
    });
  });

  describe('When operational headers (branchId & academicYearId) ARE provided', () => {
    it('automatically injects direct fields (academicYearId & branchId) into where', async () => {
      mockPrisma.mockSection.findMany.mockResolvedValue([]);

      await RequestContext.run(
        {
          userId: 1,
          instituteId: 9,
          role: 'ADMIN',
          language: 'ar',
          academicYearId: 2,
          branchId: 5,
        },
        async () => {
          await sectionRepo.findMany({ where: { name: 'Section A' } });

          expect(mockPrisma.mockSection.findMany).toHaveBeenCalledWith({
            where: {
              name: 'Section A',
              instituteId: 9,
              academicYearId: 2,
              branchId: 5,
            },
          });
        },
      );
    });

    it('automatically injects nested dot-path fields into where for related models', async () => {
      mockPrisma.mockHomework.findMany.mockResolvedValue([]);

      await RequestContext.run(
        {
          userId: 1,
          instituteId: 9,
          role: 'ADMIN',
          language: 'ar',
          academicYearId: 2,
          branchId: 5,
        },
        async () => {
          await homeworkRepo.findMany({ where: { title: 'Algebra HW' } });

          expect(mockPrisma.mockHomework.findMany).toHaveBeenCalledWith({
            where: {
              title: 'Algebra HW',
              instituteId: 9,
              section: {
                academicYearId: 2,
                branchId: 5,
              },
            },
          });
        },
      );
    });

    it('does NOT overwrite explicit values passed by the caller in where', async () => {
      mockPrisma.mockSection.findMany.mockResolvedValue([]);

      await RequestContext.run(
        {
          userId: 1,
          instituteId: 9,
          role: 'ADMIN',
          language: 'ar',
          academicYearId: 2,
          branchId: 5,
        },
        async () => {
          // Caller explicitly queries a different year: 99
          await sectionRepo.findMany({
            where: { name: 'Archived Section', academicYearId: 99 },
          });

          expect(mockPrisma.mockSection.findMany).toHaveBeenCalledWith({
            where: {
              name: 'Archived Section',
              instituteId: 9,
              academicYearId: 99,
              branchId: 5,
            },
          });
        },
      );
    });

    it('auto-populates direct fields on create if not provided in payload', async () => {
      mockPrisma.mockSection.create.mockResolvedValue({ id: 101 });

      await RequestContext.run(
        {
          userId: 1,
          instituteId: 9,
          role: 'ADMIN',
          language: 'ar',
          academicYearId: 2,
          branchId: 5,
        },
        async () => {
          await sectionRepo.create({ name: 'New Auto-Scoped Section' });

          expect(mockPrisma.mockSection.create).toHaveBeenCalledWith({
            data: {
              name: 'New Auto-Scoped Section',
              instituteId: 9,
              academicYearId: 2,
              branchId: 5,
            },
          });
        },
      );
    });
  });
});
