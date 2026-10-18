import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFamilyDto } from '../../families/dto/create-family.dto';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsDateString()
  @IsNotEmpty()
  birthDate: string;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'ذكر', 'أنثى'])
  gender: string;

  @IsInt()
  @IsOptional()
  branchId?: number;

  @IsInt()
  @IsOptional()
  familyId?: number;

  @ValidateNested()
  @Type(() => CreateFamilyDto)
  @IsOptional()
  newFamily?: CreateFamilyDto;

  @IsInt()
  @IsOptional()
  sectionId?: number;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}
