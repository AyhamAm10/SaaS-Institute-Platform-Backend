import { jest } from '@jest/globals';
import { TenantAwareRepository } from './tenant-aware.repository';
import { SystemRepository } from './system.repository';
import { RequestContext } from '../context/request-context';
import { PrismaService } from './prisma.service';

interface MockEntity {
  id: number;
  instituteId: number;
  name: string;
}

class MockTenantRepository extends TenantAwareRepository<MockEntity> {
  constructor(prisma: PrismaService) {
    super(prisma, 'mockModel');
  }
}

class MockSystemRepository extends SystemRepository<MockEntity> {
  constructor(prisma: PrismaService) {
    super(prisma, 'mockModel');
  }
}

describe('TenantAwareRepository vs SystemRepository', () => {
  let mockPrisma: any;
  let tenantRepo: MockTenantRepository;
  let systemRepo: MockSystemRepository;

  beforeEach(() => {
    mockPrisma = {
      mockModel: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    tenantRepo = new MockTenantRepository(mockPrisma);
    systemRepo = new MockSystemRepository(mockPrisma);
  });

  describe('TenantAwareRepository', () => {
    it('automatically scopes findMany to current instituteId', async () => {
      mockPrisma.mockModel.findMany.mockResolvedValue([]);

      await RequestContext.run(
        { userId: 1, instituteId: 42, role: 'ADMIN', language: 'en' },
        async () => {
          await tenantRepo.findMany({ where: { name: 'Math' } });

          expect(mockPrisma.mockModel.findMany).toHaveBeenCalledWith({
            where: { name: 'Math', instituteId: 42 },
          });
        },
      );
    });

    it('automatically injects instituteId on create', async () => {
      mockPrisma.mockModel.create.mockResolvedValue({ id: 1, instituteId: 99, name: 'Physics' });

      await RequestContext.run(
        { userId: 1, instituteId: 99, role: 'ADMIN', language: 'en' },
        async () => {
          await tenantRepo.create({ name: 'Physics' });

          expect(mockPrisma.mockModel.create).toHaveBeenCalledWith({
            data: { name: 'Physics', instituteId: 99 },
          });
        },
      );
    });

    it('prevents cross-tenant update if record belongs to a different institute', async () => {
      // findFirst returns null because instituteId doesn't match
      mockPrisma.mockModel.findFirst.mockResolvedValue(null);

      await RequestContext.run(
        { userId: 1, instituteId: 10, role: 'ADMIN', language: 'en' },
        async () => {
          await expect(tenantRepo.update(5, { name: 'Hacked' })).rejects.toThrow(
            'mockModel with id 5 not found in current tenant',
          );
          expect(mockPrisma.mockModel.update).not.toHaveBeenCalled();
        },
      );
    });

    it('allows update when record belongs to current institute', async () => {
      mockPrisma.mockModel.findFirst.mockResolvedValue({ id: 5, instituteId: 10, name: 'Old' });
      mockPrisma.mockModel.update.mockResolvedValue({ id: 5, instituteId: 10, name: 'New' });

      await RequestContext.run(
        { userId: 1, instituteId: 10, role: 'ADMIN', language: 'en' },
        async () => {
          await tenantRepo.update(5, { name: 'New' });
          expect(mockPrisma.mockModel.update).toHaveBeenCalledWith({
            where: { id: 5 },
            data: { name: 'New' },
          });
        },
      );
    });
  });

  describe('SystemRepository', () => {
    it('executes without tenant scoping for legitimate cross-tenant needs', async () => {
      mockPrisma.mockModel.findMany.mockResolvedValue([]);

      await systemRepo.findMany({ where: { name: 'Admin' } });

      expect(mockPrisma.mockModel.findMany).toHaveBeenCalledWith({
        where: { name: 'Admin' },
      });
    });
  });
});
