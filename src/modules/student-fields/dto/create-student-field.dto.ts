import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'] as const;
export type FieldType = typeof FIELD_TYPES[number];

export class CreateStudentFieldDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Field name must contain only lowercase letters, numbers, and underscores (e.g. blood_type)',
  })
  name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsIn(FIELD_TYPES)
  type: FieldType;

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

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
