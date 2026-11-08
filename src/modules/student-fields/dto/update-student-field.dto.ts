import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { FIELD_TYPES } from './create-student-field.dto';
import type { FieldType } from './create-student-field.dto';

export class UpdateStudentFieldDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsIn(FIELD_TYPES)
  @IsOptional()
  type?: FieldType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  displayInReport?: boolean;

  @IsBoolean()
  @IsOptional()
  isFilterable?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
