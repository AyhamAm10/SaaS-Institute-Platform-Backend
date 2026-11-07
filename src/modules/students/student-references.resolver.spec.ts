import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { StudentReferencesResolver } from './student-references.resolver';
import { CitiesService } from '../reference-data/cities/cities.service';
import { SchoolsService } from '../reference-data/schools/schools.service';
import { BusesService } from '../reference-data/buses/buses.service';
import { KnowWaysService } from '../reference-data/know-ways/know-ways.service';
import { StudentStatusesService } from '../reference-data/student-statuses/student-statuses.service';

describe('StudentReferencesResolver', () => {
  const lookup = () => ({ getById: jest.fn(async (id: number) => ({ id })) });
  const buses = {
    getById: jest.fn(async (id: number) => ({ id, branchId: 1 })),
  };
  const statuses = {
    getById: jest.fn(async (id: number) => ({ id })),
    getDefault: jest.fn(async () => ({ id: 7 })),
  };
  const resolver = new StudentReferencesResolver(
    lookup() as unknown as CitiesService,
    lookup() as unknown as SchoolsService,
    buses as unknown as BusesService,
    lookup() as unknown as KnowWaysService,
    statuses as unknown as StudentStatusesService,
  );

  it('applies the default status on create', async () => {
    const data = await resolver.resolve({ cityId: 3 }, 1, { isCreate: true });

    expect(data).toEqual({ cityId: 3, statusId: 7 });
  });

  it('clears links with null and leaves untouched fields out', async () => {
    const data = await resolver.resolve({ schoolId: null, busId: null }, 1);

    expect(data).toEqual({ schoolId: null, busId: null });
  });

  it('rejects a bus of another branch', async () => {
    await expect(resolver.resolve({ busId: 4 }, 2)).rejects.toThrow(
      HttpException,
    );
  });

  it('re-checks the current bus when the branch changes', async () => {
    await expect(resolver.resolve({}, 2, { currentBusId: 4 })).rejects.toThrow(
      HttpException,
    );
  });
});
