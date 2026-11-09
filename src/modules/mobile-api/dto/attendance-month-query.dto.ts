import { IsOptional, Matches } from 'class-validator';

/** `GET /mobile/students/:id/attendance?month=YYYY-MM` */
export class AttendanceMonthQueryDto {
  /** Calendar month; defaults to the current month in the institute time zone. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in the form YYYY-MM',
  })
  month?: string;
}
