import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStudentAccountDto {
  @IsInt()
  @IsPositive()
  studentId!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

