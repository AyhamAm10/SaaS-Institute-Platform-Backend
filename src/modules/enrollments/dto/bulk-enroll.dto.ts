import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
} from 'class-validator';

/** Enroll several students in one section. */
export class BulkEnrollDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  studentIds!: number[];
}

export interface BulkEnrollResult {
  enrolled: { studentId: number; enrollmentId: number }[];
  rejected: { studentId: number; reason: string }[];
}
