import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { StatusTone, StudentStatus } from '@prisma/client';
import { StudentStatusesService } from './student-statuses.service';
import { StudentStatusRepository } from './student-status.repository';
import { StudentStatusSystemRepository } from './student-status-system.repository';
import { TransactionHelper } from '../../../database/transaction.helper';

const status = (id: number, name: string, isDefault: boolean): StudentStatus =>
  ({
    id,
    name,
    isDefault,
    isActive: true,
    tone: StatusTone.NEUTRAL,
  }) as StudentStatus;

describe('StudentStatusesService', () => {
  let repo: Record<string, jest.Mock>;
  let service: StudentStatusesService;
  const rows = [status(1, 'مستمر', true), status(2, 'منقطع', false)];

  beforeEach(() => {
    repo = {
      findById: jest.fn(
        async (id: number) => rows.find((r) => r.id === id) ?? null,
      ),
      findByName: jest.fn(async () => null),
      create: jest.fn(async (data: object) => ({ id: 3, ...data })),
      update: jest.fn(async (id: number, data: object) => ({ id, ...data })),
      delete: jest.fn(async () => undefined),
      countUsage: jest.fn(async () => 0),
      unsetDefault: jest.fn(async () => undefined),
      findDefault: jest.fn(async () => rows[0]),
    };
    service = new StudentStatusesService(
      repo as unknown as StudentStatusRepository,
      {} as StudentStatusSystemRepository,
      {
        executeInTransaction: (fn: () => Promise<unknown>) => fn(),
      } as unknown as TransactionHelper,
    );
  });

  it('unsets the previous default when a new default is created', async () => {
    await service.create({ name: 'مؤجل', isDefault: true });

    expect(repo.unsetDefault).toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('refuses to delete the default status', async () => {
    await expect(service.delete(1)).rejects.toThrow(HttpException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('refuses to deactivate or un-default the default status', async () => {
    await expect(service.update(1, { isActive: false })).rejects.toThrow(
      HttpException,
    );
    await expect(service.update(1, { isDefault: false })).rejects.toThrow(
      HttpException,
    );
  });

  it('switches the default to another status', async () => {
    await service.update(2, { isDefault: true });

    expect(repo.unsetDefault).toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(2, { isDefault: true });
  });
});
