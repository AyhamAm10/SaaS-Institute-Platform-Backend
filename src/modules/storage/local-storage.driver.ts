import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriver } from './storage-driver';

/**
 * Stores files on the local disk under STORAGE_LOCAL_DIR (default `uploads/`).
 * Intended for development; production should use an S3-compatible driver.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.root = resolve(
      configService.get<string>('STORAGE_LOCAL_DIR') ?? 'uploads',
    );
  }

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async get(key: string): Promise<Readable | null> {
    const path = this.resolveKey(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
    } catch {
      return null;
    }
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  /** Resolves a key inside the root, refusing path traversal. */
  private resolveKey(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return path;
  }
}
