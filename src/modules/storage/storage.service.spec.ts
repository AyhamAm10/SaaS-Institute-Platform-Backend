import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { StorageService } from './storage.service';
import { StorageDriver } from './storage-driver';
import { FileCategory } from './dto/upload-file.dto';
import { RequestContext } from '../../context/request-context';

describe('StorageService', () => {
  const ctx = {
    userId: 1,
    instituteId: 7,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
  };
  let driver: jest.Mocked<StorageDriver>;
  let service: StorageService;

  beforeEach(() => {
    driver = {
      put: jest.fn(async () => undefined),
      get: jest.fn(async () => Readable.from(['data'])),
      delete: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<StorageDriver>;
    service = new StorageService(driver);
  });

  it('stores uploads under the caller institute prefix', async () => {
    const result = await RequestContext.run(ctx, () =>
      service.upload(FileCategory.STUDENT_PHOTO, {
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        size: 1,
      }),
    );

    expect(result.key).toMatch(
      /^institutes\/7\/student-photo\/[0-9a-f-]{36}\.png$/,
    );
    expect(driver.put).toHaveBeenCalledWith(
      result.key,
      expect.any(Buffer),
      'image/png',
    );
  });

  it('rejects disallowed file types', async () => {
    await expect(
      RequestContext.run(ctx, () =>
        service.upload(FileCategory.STUDENT_PHOTO, {
          buffer: Buffer.from('x'),
          mimetype: 'text/html',
          size: 1,
        }),
      ),
    ).rejects.toThrow(HttpException);
    expect(driver.put).not.toHaveBeenCalled();
  });

  it('reads only inside the caller institute and rejects odd file names', async () => {
    const name = '123e4567-e89b-12d3-a456-426614174000.pdf';
    await RequestContext.run(ctx, () =>
      service.read(FileCategory.STUDENT_DOCUMENT, name),
    );
    expect(driver.get).toHaveBeenCalledWith(
      `institutes/7/student-document/${name}`,
    );

    await expect(
      RequestContext.run(ctx, () =>
        service.read(FileCategory.STUDENT_DOCUMENT, '../../institutes/8/x.pdf'),
      ),
    ).rejects.toThrow(HttpException);
  });
});
