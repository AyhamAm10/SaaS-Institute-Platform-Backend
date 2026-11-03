import { IsEnum } from 'class-validator';

/** What a file is used for — becomes a folder in the storage key. */
export enum FileCategory {
  STUDENT_PHOTO = 'student-photo',
  STUDENT_DOCUMENT = 'student-document',
  TEACHER_PHOTO = 'teacher-photo',
  INSTITUTE_LOGO = 'institute-logo',
}

export class UploadFileDto {
  @IsEnum(FileCategory)
  category: FileCategory;
}

/** The parts of a multer upload the service uses. */
export interface IncomingFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface UploadedFileResponse {
  /** Storage key, e.g. `institutes/2/student-photo/<uuid>.jpg`. */
  key: string;
  /** API path to download the file (authenticated, same institute only). */
  url: string;
  contentType: string;
  size: number;
}
