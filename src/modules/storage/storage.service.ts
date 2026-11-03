import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { STORAGE_DRIVER } from './storage-driver';
import type { StorageDriver } from './storage-driver';
import {
  FileCategory,
  IncomingFile,
  UploadedFileResponse,
} from './dto/upload-file.dto';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Allowed upload types → stored file extension. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

/**
 * Tenant-isolated file storage. Every key is prefixed with the caller's
 * institute (`institutes/<instituteId>/…`) and files can only be read back
 * by the same institute.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async upload(
    category: FileCategory,
    file: IncomingFile | undefined,
  ): Promise<UploadedFileResponse> {
    Ensure.required(file, 'file');
    const extension = ALLOWED_TYPES[file!.mimetype];
    Ensure.custom(!extension, ErrorMessages.get('file_type_not_allowed'), 400);
    Ensure.custom(
      file!.size > MAX_UPLOAD_BYTES,
      ErrorMessages.get('file_too_large'),
      400,
    );

    const fileName = `${randomUUID()}.${extension}`;
    const key = this.buildKey(category, fileName);
    await this.driver.put(key, file!.buffer, file!.mimetype);

    return {
      key,
      url: `/files/${category}/${fileName}`,
      contentType: file!.mimetype,
      size: file!.size,
    };
  }

  /** Opens a file of the caller's institute. */
  async read(
    category: FileCategory,
    fileName: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    Ensure.custom(
      !FILE_NAME_PATTERN.test(fileName),
      ErrorMessages.get('file_not_found'),
      404,
    );
    const stream = await this.driver.get(this.buildKey(category, fileName));
    Ensure.custom(!stream, ErrorMessages.get('file_not_found'), 404);

    const extension = fileName.split('.').pop()!;
    const contentType = Object.keys(ALLOWED_TYPES).find(
      (type) => ALLOWED_TYPES[type] === extension,
    )!;
    return { stream: stream!, contentType };
  }

  private buildKey(category: FileCategory, fileName: string): string {
    return `institutes/${RequestContext.getInstituteId()}/${category}/${fileName}`;
  }
}
