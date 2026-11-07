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
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

@Controller('schedule-config')
@RequireResource(Resource.Settings)
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
