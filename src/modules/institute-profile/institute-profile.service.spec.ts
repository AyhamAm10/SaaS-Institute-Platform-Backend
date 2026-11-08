import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { CacheKeys } from '../../infrastructure/cache/cache-keys';
import { InstituteProfileService } from './institute-profile.service';

describe('InstituteProfileService', () => {
  const ctx = {
    userId: 1,
    instituteId: 5,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
  };

  const mockProfile = {
    id: 5,
    code: 'INST05',
    name: 'الأمل التعليمي',
    phone: '0911111111',
    address: 'دمشق - الميدان',
    timezone: 'Asia/Damascus',
    logoUrl: '/logo.png',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: InstituteProfileService;
  let repo: { findProfile: jest.Mock; updateProfile: jest.Mock };
  let cache: { del: jest.Mock };

  beforeEach(() => {
    repo = {
      findProfile: jest.fn(async () => ({ ...mockProfile })),
      updateProfile: jest.fn(async () => ({ ...mockProfile })),
    };
    cache = {
      del: jest.fn(async () => undefined),
    };
    service = new InstituteProfileService(repo as never, cache as never);
  });

  it('retrieves the profile of the current context institute', async () => {
    const result = await RequestContext.run(ctx, () => service.getProfile());
    expect(repo.findProfile).toHaveBeenCalledWith(5);
    expect(result.id).toBe(5);
    expect(result.name).toBe('الأمل التعليمي');
  });

  it('throws NotFoundException when the institute is not found', async () => {
    repo.findProfile.mockResolvedValueOnce(null);
    await expect(
      RequestContext.run(ctx, () => service.getProfile()),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates profile and invalidates timezone cache on timezone change', async () => {
    await RequestContext.run(ctx, () =>
      service.updateProfile({
        name: 'اسم جديد',
        timezone: 'Asia/Dubai',
      }),
    );

    expect(repo.updateProfile).toHaveBeenCalledWith(5, {
      name: 'اسم جديد',
      timezone: 'Asia/Dubai',
    });
    expect(cache.del).toHaveBeenCalledWith(CacheKeys.instituteTimezone, []);
  });

  it('rejects an invalid IANA timezone', async () => {
    await expect(
      RequestContext.run(ctx, () =>
        service.updateProfile({ timezone: 'Invalid/Zone_Name' }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });
});

