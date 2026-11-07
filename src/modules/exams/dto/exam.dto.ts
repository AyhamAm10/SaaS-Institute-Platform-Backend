import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class CreateExamDto {
  @IsInt()
  @IsPositive()
  sectionId!: number;

  @IsInt()
  @IsPositive()
  subjectId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  examTypeId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** Local date `YYYY-MM-DD`, inside the section's academic year. */
  @IsDateString({ strict: true })
  examDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  maxMark!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  passMark!: number;
}

/** Section and subject cannot change (results belong to them). */
export class UpdateExamDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  examTypeId?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  examDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  maxMark?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  passMark?: number;
}

export class ExamQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sectionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  subjectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  examTypeId?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ResultEntryDto {
  @IsInt()
  @IsPositive()
  studentId!: number;

  /** null / omitted = no mark yet (PENDING). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  mark?: number | null;

  @IsOptional()
  @IsBoolean()
  absent?: boolean;
}

/** Bulk upsert of an exam's marks. */
export class SaveResultsDto {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ResultEntryDto)
  results!: ResultEntryDto[];
}

export class DeleteExamQueryDto {
  /** Required to delete an exam that already has marks. */
  @IsOptional()
  @Type(() => String)
  force?: string;
}
