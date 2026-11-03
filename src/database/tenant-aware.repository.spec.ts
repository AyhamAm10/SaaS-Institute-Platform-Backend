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

class MockSoftDeleteRepository extends TenantAwareRepository<MockEntity> {
  protected override readonly softDelete = true;
  protected override readonly softDeleteReleaseFields = ['name'];
  protected override readonly audited = true;

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
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockPrisma),
      ),
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
      mockPrisma.mockModel.create.mockResolvedValue({
        id: 1,
        instituteId: 99,
        name: 'Physics',
      });

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
          await expect(
            tenantRepo.update(5, { name: 'Hacked' }),
          ).rejects.toThrow('mockModel with id 5 not found in current tenant');
          expect(mockPrisma.mockModel.update).not.toHaveBeenCalled();
        },
      );
    });

    it('allows update when record belongs to current institute', async () => {
      mockPrisma.mockModel.findFirst.mockResolvedValue({
        id: 5,
        instituteId: 10,
        name: 'Old',
      });
      mockPrisma.mockModel.update.mockResolvedValue({
        id: 5,
        instituteId: 10,
        name: 'New',
      });

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

  describe('Soft delete & audit (softDelete / audited flags)', () => {
    const ctx = { userId: 7, instituteId: 42, role: 'ADMIN', language: 'en' };
    let softRepo: MockSoftDeleteRepository;

    beforeEach(() => {
      softRepo = new MockSoftDeleteRepository(mockPrisma);
    });

    it('excludes soft-deleted rows from scoped reads', async () => {
      mockPrisma.mockModel.findMany.mockResolvedValue([]);

      await RequestContext.run(ctx, async () => {
        await softRepo.findMany({ where: { name: 'Math' } });

        expect(mockPrisma.mockModel.findMany).toHaveBeenCalledWith({
          where: { name: 'Math', instituteId: 42, deletedAt: null },
        });
      });
    });

    it('keeps hard-delete behaviour for repositories without the flags', async () => {
      mockPrisma.mockModel.findFirst.mockResolvedValue({
        id: 1,
        instituteId: 42,
        name: 'A',
      });

      await RequestContext.run(ctx, async () => {
        await tenantRepo.delete(1);

        expect(mockPrisma.mockModel.delete).toHaveBeenCalledWith({
          where: { id: 1 },
        });
        expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      });
    });

    it('stamps the actor on create', async () => {
      await RequestContext.run(ctx, async () => {
        await softRepo.create({ name: 'Physics' });

        expect(mockPrisma.mockModel.create).toHaveBeenCalledWith({
          data: {
            name: 'Physics',
            createdById: 7,
            updatedById: 7,
            instituteId: 42,
          },
        });
      });
    });

    it('soft-deletes, releases unique fields and writes an audit row', async () => {
      mockPrisma.mockModel.findFirst.mockResolvedValue({
        id: 5,
        instituteId: 42,
        name: 'Math',
      });

      await RequestContext.run(ctx, async () => {
        await softRepo.delete(5);

        expect(mockPrisma.mockModel.delete).not.toHaveBeenCalled();
        const call = mockPrisma.mockModel.update.mock.calls[0][0];
        expect(call.where).toEqual({ id: 5 });
        expect(call.data.name).toBe('Math__deleted_5');
        expect(call.data.deletedAt).toBeInstanceOf(Date);
        expect(call.data.updatedById).toBe(7);
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            instituteId: 42,
            userId: 7,
            entity: 'mockModel',
            entityId: 5,
            action: 'DELETE',
          }),
        });
      });
    });

    it('audits updates without leaking password fields', async () => {
      mockPrisma.mockModel.findFirst.mockResolvedValue({
        id: 3,
        instituteId: 42,
        name: 'Old',
        passwordHash: 'secret',
      });

      await RequestContext.run(ctx, async () => {
        await softRepo.update(3, { name: 'New' });

        expect(mockPrisma.mockModel.update).toHaveBeenCalledWith({
          where: { id: 3 },
          data: { name: 'New', updatedById: 7 },
        });
        const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
        expect(audit.action).toBe('UPDATE');
        expect(audit.before).toEqual({ id: 3, instituteId: 42, name: 'Old' });
        expect(audit.changes).toEqual({ name: 'New' });
      });
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
