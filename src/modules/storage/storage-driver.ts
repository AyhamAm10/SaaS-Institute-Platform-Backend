import { Readable } from 'node:stream';

/** DI token of the active storage driver (selected by STORAGE_DRIVER). */
export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/**
 * Backend-agnostic file storage. Keys are relative paths such as
 * `institutes/2/student-photo/<uuid>.jpg`; tenant prefixing is done by
 * StorageService, never by drivers.
 */
export interface StorageDriver {
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<Readable | null>;
  delete(key: string): Promise<void>;
}
