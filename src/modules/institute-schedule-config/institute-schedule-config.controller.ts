import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
} from '@nestjs/common';
import { InstituteScheduleConfigService } from './institute-schedule-config.service';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('schedule-config')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class InstituteScheduleConfigController {
  constructor(
    @Inject(InstituteScheduleConfigService)
    private readonly service: InstituteScheduleConfigService,
  ) {}

  @Get()
  async getConfig() {
    return this.service.getConfig();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() dto: UpdateScheduleConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Get('slots')
  async getSlots() {
    const config = await this.service.getConfig();
    return config.slots;
  }
}
