import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseEnumPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES, StorageService } from './storage.service';
import { FileCategory, UploadFileDto } from './dto/upload-file.dto';
import type { IncomingFile } from './dto/upload-file.dto';

/**
 * File upload/download for the caller's institute.
 * Upload: multipart/form-data with fields `file` and `category`.
 */
@Controller('files')
export class StorageController {
  constructor(
    @Inject(StorageService)
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @Body() dto: UploadFileDto,
    @UploadedFile() file?: IncomingFile,
  ) {
    return this.storageService.upload(dto.category, file);
  }

  @Get(':category/:fileName')
  async download(
    @Param('category', new ParseEnumPipe(FileCategory)) category: FileCategory,
    @Param('fileName') fileName: string,
  ): Promise<StreamableFile> {
    const { stream, contentType } = await this.storageService.read(
      category,
      fileName,
    );
    return new StreamableFile(stream, { type: contentType });
  }
}
