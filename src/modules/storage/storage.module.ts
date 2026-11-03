import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { LocalStorageDriver } from './local-storage.driver';
import { STORAGE_DRIVER } from './storage-driver';

/**
 * File storage. The driver is chosen here; only `local` exists today —
 * an S3-compatible driver implementing StorageDriver can be added without
 * touching StorageService or its consumers.
 */
@Module({
  controllers: [StorageController],
  providers: [
    StorageService,
    LocalStorageDriver,
    { provide: STORAGE_DRIVER, useExisting: LocalStorageDriver },
  ],
  exports: [StorageService],
})
export class StorageModule {}
