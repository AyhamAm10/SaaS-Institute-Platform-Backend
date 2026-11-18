import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { NotificationsService } from './notifications.service';
import {
  NotificationSettingsDto,
  NotificationsQueryDto,
  RegisterDeviceDto,
  RemoveDeviceDto,
} from './dto/notifications.dto';

/**
 * The signed-in person's notifications (guardian, student or teacher apps):
 * inbox, read state, devices for push, and the categories they turned off.
 */
@Controller('notifications')
@Roles(UserRole.FAMILY, UserRole.STUDENT, UserRole.TEACHER)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  inbox(@Query() query: NotificationsQueryDto) {
    return this.notifications.inbox(query.page, query.limit);
  }

  @Get('unread-count')
  unread() {
    return this.notifications.unreadCount();
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll() {
    return this.notifications.markRead();
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(id);
  }

  @Post('devices')
  @HttpCode(HttpStatus.OK)
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(dto.token, dto.platform, dto.app);
  }

  /** Called on sign-out, before the token is forgotten on the device. */
  @Delete('devices')
  @HttpCode(HttpStatus.OK)
  removeDevice(@Body() dto: RemoveDeviceDto) {
    return this.notifications.removeDevice(dto.token);
  }

  @Get('settings')
  settings() {
    return this.notifications.getSettings();
  }

  @Put('settings')
  saveSettings(@Body() dto: NotificationSettingsDto) {
    return this.notifications.saveSettings(dto.disabledCategories);
  }
}
