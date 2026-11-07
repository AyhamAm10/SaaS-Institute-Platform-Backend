import { EnrollmentStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Withdraw, complete or re-activate an enrollment. */
export class ChangeEnrollmentStatusDto {
  @IsIn([
    EnrollmentStatus.ACTIVE,
    EnrollmentStatus.WITHDRAWN,
    EnrollmentStatus.COMPLETED,
  ])
  status!: EnrollmentStatus;

  /** Required when withdrawing. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
