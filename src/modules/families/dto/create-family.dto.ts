import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @IsNotEmpty()
  familyName: string;

  @IsString()
  @IsOptional()
  fatherName?: string;

  @IsString()
  @IsOptional()
  motherName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  fatherJob?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  motherJob?: string;

  /** The father's own mobile (the family phone stays the guardian login). */
  @IsString()
  @IsOptional()
  @MaxLength(30)
  fatherPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  motherPhone?: string;
}

const PARENT_DETAIL_FIELDS = ['fatherJob', 'motherJob', 'fatherPhone', 'motherPhone'] as const;

/** The parents' jobs and mobiles as stored: trimmed, empty -> null; absent ones untouched. */
export function parentDetailsData(dto: Partial<CreateFamilyDto>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const key of PARENT_DETAIL_FIELDS) {
    if (dto[key] !== undefined) data[key] = dto[key]!.trim() || null;
  }
  return data;
}
