import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Longest note: a short message to the family, not a document. */
export const NOTE_MAX_LENGTH = 1000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStudentNoteDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(NOTE_MAX_LENGTH)
  body!: string;

  /** Shown in the parents app (default) or kept internal to the dashboard. */
  @IsOptional()
  @IsBoolean()
  visibleToFamily?: boolean;
}

export class UpdateStudentNoteDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(NOTE_MAX_LENGTH)
  body?: string;

  @IsOptional()
  @IsBoolean()
  visibleToFamily?: boolean;
}

/** A note as the API returns it. */
export interface StudentNoteView {
  id: number;
  studentId: number;
  body: string;
  visibleToFamily: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Who wrote it (null when the account no longer exists). */
  author: string | null;
}
