import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateStudentFieldDto {
  @IsString()
  @IsOptional()
  label?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
