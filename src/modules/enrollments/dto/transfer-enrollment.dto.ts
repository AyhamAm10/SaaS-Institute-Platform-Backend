import { IsInt, IsPositive } from 'class-validator';

/** Move an active enrollment to another section (same year and branch). */
export class TransferEnrollmentDto {
  @IsInt()
  @IsPositive()
  sectionId!: number;
}
