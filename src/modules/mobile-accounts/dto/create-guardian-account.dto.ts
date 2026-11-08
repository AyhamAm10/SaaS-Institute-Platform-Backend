import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { GuardianRelationship } from '@prisma/client';

export class CreateGuardianAccountDto {
  @IsInt()
  @IsPositive()
  familyId!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone!: string;

  @IsEnum(GuardianRelationship)
  relationship!: GuardianRelationship;

  @IsString()
  @MinLength(8)
  password!: string;
}

