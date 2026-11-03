import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Gender } from '@prisma/client';
import { CreateFamilyDto } from '../../families/dto/create-family.dto';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsDateString()
  @IsNotEmpty()
  birthDate: string;

  // Legacy Arabic values are still accepted and normalized to the enum.
  @Transform(({ value }) =>
    value === 'ذكر' ? Gender.MALE : value === 'أنثى' ? Gender.FEMALE : value,
  )
  @IsEnum(Gender)
  gender: Gender;

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
