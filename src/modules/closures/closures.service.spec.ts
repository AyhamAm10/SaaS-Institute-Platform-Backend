import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClosuresService } from './closures.service';
import { ClosureRepository } from './closure.repository';
import { BranchRepository } from '../branches/branch.repository';
import { SectionRepository } from '../sections/section.repository';
import { TransactionHelper } from '../../database/transaction.helper';

const row = (over: object = {}) => ({
  id: 1,
  scope: 'INSTITUTE',
  branchId: null,
  branch: null,
  fromDate: new Date('2026-11-10T00:00:00Z'),
  toDate: new Date('2026-11-12T00:00:00Z'),
  reason: 'عطلة رسمية',
  sections: [],
  ...over,
});

describe('ClosuresService', () => {
  let service: ClosuresService;
  let repo: any;
  let branches: any;
  let sections: any;

  beforeEach(async () => {
    repo = {
      findOverlapping: jest.fn<any>().mockResolvedValue([]),
      findWithRefs: jest.fn<any>().mockResolvedValue(row()),
      findById: jest.fn<any>().mockResolvedValue({ id: 1 }),
      create: jest.fn<any>().mockResolvedValue({ id: 1 }),
      update: jest.fn<any>().mockResolvedValue({ id: 1 }),
      delete: jest.fn<any>().mockResolvedValue(undefined),
      replaceSections: jest.fn<any>().mockResolvedValue(undefined),
    };
    branches = { findById: jest.fn<any>().mockResolvedValue({ id: 4 }) };
    sections = {
      findMany: jest.fn<any>().mockResolvedValue([{ id: 7 }, { id: 8 }]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClosuresService,
        { provide: ClosureRepository, useValue: repo },
        { provide: BranchRepository, useValue: branches },
        { provide: SectionRepository, useValue: sections },
        {
          provide: TransactionHelper,
          useValue: {
            executeInTransaction: (fn: () => Promise<unknown>) => fn(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(ClosuresService);
  });

  const base = {
    fromDate: '2026-11-10',
    toDate: '2026-11-12',
    reason: 'عطلة رسمية',
  };

  it('creates an institute-wide closure without branch or sections', async () => {
    const view = await service.create({ scope: 'INSTITUTE', ...base } as any);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'INSTITUTE', branchId: null }),
    );
    expect(repo.replaceSections).toHaveBeenCalledWith(1, []);
    expect(view).toEqual(
      expect.objectContaining({ fromDate: '2026-11-10', toDate: '2026-11-12' }),
    );
  });

  it('rejects an end date before the start date', async () => {
    await expect(
      service.create({
        scope: 'INSTITUTE',
        ...base,
        fromDate: '2026-11-13',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a closure longer than 366 days', async () => {
    await expect(
      service.create({
        scope: 'INSTITUTE',
        ...base,
        fromDate: '2026-01-01',
        toDate: '2027-01-02',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires a branch for a branch closure and refuses sections with it', async () => {
    await expect(
      service.create({ scope: 'BRANCH', ...base } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({
        scope: 'BRANCH',
        branchId: 4,
        sectionIds: [7],
        ...base,
      } as any),
    ).rejects.toThrow(BadRequestException);
    await service.create({ scope: 'BRANCH', branchId: 4, ...base } as any);
    expect(branches.findById).toHaveBeenCalledWith(4);
  });

  it('requires existing sections for a section closure', async () => {
    await expect(
      service.create({ scope: 'SECTION', ...base } as any),
    ).rejects.toThrow(BadRequestException);
    sections.findMany.mockResolvedValue([{ id: 7 }]);
    await expect(
      service.create({ scope: 'SECTION', sectionIds: [7, 8], ...base } as any),
    ).rejects.toThrow(BadRequestException);
    sections.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);
    await service.create({ scope: 'SECTION', sectionIds: [7, 8], ...base } as any);
    expect(repo.replaceSections).toHaveBeenCalledWith(1, [7, 8]);
  });

  it('refuses branch or sections on an institute closure', async () => {
    await expect(
      service.create({ scope: 'INSTITUTE', branchId: 4, ...base } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('drops the old branch when the scope changes on update', async () => {
    repo.findWithRefs.mockResolvedValue(
      row({ scope: 'BRANCH', branchId: 4, branch: { id: 4, name: 'الفرع' } }),
    );
    await service.update(1, { scope: 'INSTITUTE' });
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ scope: 'INSTITUTE', branchId: null }),
    );
  });

  it('keeps the other fields when only the reason changes', async () => {
    await service.update(1, { reason: 'عطلة العيد' });
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reason: 'عطلة العيد', scope: 'INSTITUTE' }),
    );
  });

  it('answers 404 for a closure of another institute', async () => {
    repo.findWithRefs.mockResolvedValue(null);
    await expect(service.update(99, { reason: 'x1' })).rejects.toThrow(
      NotFoundException,
    );
    repo.findById.mockResolvedValue(null);
    await expect(service.remove(99)).rejects.toThrow(NotFoundException);
  });

  it('removes the closure with its sections', async () => {
    await service.remove(1);
    expect(repo.replaceSections).toHaveBeenCalledWith(1, []);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('finds the closure covering a student on a day', async () => {
    repo.findOverlapping.mockResolvedValue([
      row({
        id: 5,
        scope: 'SECTION',
        sections: [{ section: { id: 7, name: 'تاسع' } }],
      }),
    ]);
    const hit = await service.findCovering('2026-11-11', { sectionIds: [7] });
    expect(hit?.id).toBe(5);
    expect(await service.findCovering('2026-11-11', { sectionIds: [9] })).toBeNull();
  });
});
