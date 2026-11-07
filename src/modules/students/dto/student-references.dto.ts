import { IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 * Reference-data links of a student (cities, schools, buses, referral source,
 * status). On update `null` clears a link; `statusId` cannot be cleared.
 */
export class StudentReferencesDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  cityId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  schoolId?: number | null;

  /** Must belong to the student's branch. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  busId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  knowWayId?: number | null;

  /** Defaults to the institute's default status on create. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  statusId?: number;
}
