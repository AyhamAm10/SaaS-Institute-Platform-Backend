import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { StudentReferencesDto } from './student-references.dto';

/**
 * Official identity of a student (used by official lists and forms). Every field is
 * optional; on update `null` or an empty text clears it. The three lists are institute
 * settings (nationalities, religions, foreign languages).
 */
export class StudentIdentityDto extends StudentReferencesDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  nationalityId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  religionId?: number | null;

  /** Foreign language studied (English / French...). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  languageId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  birthPlace?: string | null;

  /** "محل ورقم القيد". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  civilRegistry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  foreignName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grandfatherName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

/** The free-text identity fields, as stored: trimmed, empty -> null; untouched when absent. */
export const STUDENT_IDENTITY_TEXT_FIELDS = [
  'nationalId',
  'birthPlace',
  'civilRegistry',
  'foreignName',
  'grandfatherName',
  'address',
] as const;

export function identityTextData(dto: StudentIdentityDto): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const key of STUDENT_IDENTITY_TEXT_FIELDS) {
    const value = dto[key];
    if (value === undefined) continue;
    data[key] = value === null ? null : value.trim() || null;
  }
  return data;
}
