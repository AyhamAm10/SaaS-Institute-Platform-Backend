import { IsBoolean, IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/**
 * The yearly data of an enrollment: the student's situation this year, where he comes
 * from, and his official exam candidacy. Every field is optional; `null` or an empty
 * text clears it.
 */
export class UpdateEnrollmentDetailsDto {
  /** From the settings list "أوضاع الطالب" (مستجد، ناجح ويعيد...). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  situationId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  previousSchool?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  transferredFrom?: string | null;

  @IsOptional()
  @IsBoolean()
  isExamCandidate?: boolean;

  /** Defaults to the student's foreign language when he becomes a candidate. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  examLanguageId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  candidateNumber?: string | null;

  /** The certificate the candidacy relies on. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificateName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  certificateNumber?: string | null;

  @IsOptional()
  @IsDateString()
  certificateDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificateSource?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  certificateGrade?: string | null;
}

const TEXT_FIELDS = [
  'previousSchool',
  'transferredFrom',
  'candidateNumber',
  'certificateName',
  'certificateNumber',
  'certificateSource',
  'certificateGrade',
] as const;

/** The plain fields as stored (texts trimmed, empty -> null); absent ones untouched. */
export function enrollmentDetailsData(dto: UpdateEnrollmentDetailsDto): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    const value = dto[key];
    if (value !== undefined) data[key] = value === null ? null : value.trim() || null;
  }
  if (dto.isExamCandidate !== undefined) data['isExamCandidate'] = dto.isExamCandidate;
  if (dto.certificateDate !== undefined) {
    data['certificateDate'] = dto.certificateDate
      ? new Date(`${dto.certificateDate.slice(0, 10)}T00:00:00.000Z`)
      : null;
  }
  return data;
}
