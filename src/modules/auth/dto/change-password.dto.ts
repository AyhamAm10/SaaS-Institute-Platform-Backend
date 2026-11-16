import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ACCOUNT_PASSWORD_MIN } from '../../users/default-password';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword!: string;

  @IsString()
  @MinLength(ACCOUNT_PASSWORD_MIN)
  @MaxLength(100)
  newPassword!: string;
}
