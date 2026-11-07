import { jest } from '@jest/globals';
import { HttpException, NotFoundException } from '@nestjs/common';
import { LookupService } from './lookup.service';
import { LookupEntity, LookupStore } from './lookup.store';
import { CreateLookupDto, UpdateLookupDto } from './dto/lookup.dto';

class TestLookupService extends LookupService<
  LookupEntity,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(store: LookupStore<LookupEntity>) {
    super(store, 'resource_city');
  }
}

function createStore(rows: LookupEntity[], usage = 0) {
  const store = {
    findById: jest.fn(
      async (id: number) => rows.find((r) => r.id === id) ?? null,
    ),
    findByName: jest.fn(
      async (name: string) => rows.find((r) => r.name === name) ?? null,
    ),
    findPaginated: jest.fn(),
    create: jest.fn(
      async (data: Record<string, unknown>) =>
        ({ id: 99, ...data }) as LookupEntity,
    ),
    update: jest.fn(
      async (id: number, data: Record<string, unknown>) =>
        ({ id, ...data }) as LookupEntity,
    ),
    delete: jest.fn(async (id: number) => ({ id, name: '' })),
    countUsage: jest.fn(async () => usage),
  };
  return store;
}

describe('LookupService (shared reference-data rules)', () => {
  it('trims and creates a new entry', async () => {
    const store = createStore([]);
    const service = new TestLookupService(
      store as unknown as LookupStore<LookupEntity>,
    );

    await service.create({ name: '  دمشق ' });

    expect(store.create).toHaveBeenCalledWith({ name: 'دمشق' });
  });

  it('rejects a duplicate name with 409', async () => {
    const service = new TestLookupService(
      createStore([
        { id: 1, name: 'دمشق' },
      ]) as unknown as LookupStore<LookupEntity>,
    );

    await expect(service.create({ name: 'دمشق' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('allows saving an entry with its own unchanged name', async () => {
    const store = createStore([{ id: 1, name: 'دمشق' }]);
    const service = new TestLookupService(
      store as unknown as LookupStore<LookupEntity>,
    );

    await service.update(1, { name: 'دمشق' });

    expect(store.update).toHaveBeenCalledWith(1, { name: 'دمشق' });
  });

  it('refuses to delete an entry that is in use', async () => {
    const store = createStore([{ id: 1, name: 'دمشق' }], 3);
    const service = new TestLookupService(
      store as unknown as LookupStore<LookupEntity>,
    );

    await expect(service.delete(1)).rejects.toThrow(HttpException);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown id', async () => {
    const service = new TestLookupService(
      createStore([]) as unknown as LookupStore<LookupEntity>,
    );

    await expect(service.getById(5)).rejects.toThrow(NotFoundException);
  });
});
