import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Gender } from '@prisma/client';
import { StudentReferencesDto } from './student-references.dto';

/**
 * DTO for updating an existing student. Enrollment changes (section moves)
 * are not handled here.
 */
export class UpdateStudentDto extends StudentReferencesDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  // Legacy Arabic values are still accepted and normalized to the enum.
  @IsOptional()
  @Transform(({ value }) =>
    value === 'ذكر' ? Gender.MALE : value === 'أنثى' ? Gender.FEMALE : value,
  )
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsInt()
  familyId?: number;

  /** Merged into the existing custom field values. */
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
