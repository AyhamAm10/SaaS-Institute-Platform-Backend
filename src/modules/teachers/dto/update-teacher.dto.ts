import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be a valid phone number (8-15 digits)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];
}
