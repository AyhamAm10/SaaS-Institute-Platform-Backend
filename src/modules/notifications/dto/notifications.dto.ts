import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { ClientApp, PushPlatform } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { NOTIFICATION_CATEGORIES, NotificationCategory } from '../notification.types';

/** A device of the signed-in user (FCM registration token). */
export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsEnum(ClientApp)
  app!: ClientApp;
}

export class RemoveDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}

export class NotificationsQueryDto extends PaginationQueryDto {}

/** The categories the user turns off (every other one stays on). */
export class NotificationSettingsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(NOTIFICATION_CATEGORIES, { each: true })
  @Type(() => String)
  disabledCategories!: NotificationCategory[];
}
