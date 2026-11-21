import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Currency, Gender, PaymentMethod } from '@prisma/client';
import { STUDENT_GROUPS, type StudentGroup } from '../builders/student-lists';

/**
 * Parameters of every report (one DTO: the catalog says which ones a report
 * uses and which are required). Dates are local `YYYY-MM-DD` in the
 * institute time zone.
 */
export class ReportQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  studentId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sectionId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  examId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  teacherId?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** Threshold of the frequent absences report. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  minCount?: number;

  /** Number of working days on the attendance sheet. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  days?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  statusId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  cityId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  schoolId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  busId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  knowWayId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  nationalityId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  religionId?: number;

  /** Foreign language (students-directory) or exam language (exam-candidates). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  languageId?: number;

  /** Situation of the enrollment this year (مستجد، ناجح ويعيد...). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  situationId?: number;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
  @IsBoolean()
  examCandidate?: boolean;

  /** One table per value of this attribute. */
  @IsOptional()
  @IsIn(STUDENT_GROUPS)
  groupBy?: StudentGroup;

  @IsOptional()
  @IsString()
  customFilters?: string;
}

/** Query param name of each catalog parameter kind. */
export const PARAM_FIELDS = {
  student: 'studentId',
  section: 'sectionId',
  exam: 'examId',
  teacher: 'teacherId',
  date: 'date',
  from: 'from',
  to: 'to',
  currency: 'currency',
  paymentMethod: 'paymentMethod',
  minCount: 'minCount',
  days: 'days',
  status: 'statusId',
  city: 'cityId',
  school: 'schoolId',
  bus: 'busId',
  knowWay: 'knowWayId',
  nationality: 'nationalityId',
  religion: 'religionId',
  language: 'languageId',
  situation: 'situationId',
  gender: 'gender',
  examCandidate: 'examCandidate',
  groupBy: 'groupBy',
  customFilters: 'customFilters',
} as const satisfies Record<string, keyof ReportQueryDto>;
