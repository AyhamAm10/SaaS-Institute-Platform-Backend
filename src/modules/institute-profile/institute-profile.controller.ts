import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
} from '@nestjs/common';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';
import { InstituteProfileService } from './institute-profile.service';
import { UpdateInstituteProfileDto } from './dto/update-institute-profile.dto';

@Controller('institute/profile')
@RequireResource(Resource.Settings)
export class InstituteProfileController {
  constructor(
    @Inject(InstituteProfileService)
    private readonly service: InstituteProfileService,
  ) {}

  @Get()
  async getProfile() {
    return this.service.getProfile();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Body() dto: UpdateInstituteProfileDto) {
    return this.service.updateProfile(dto);
  }
}

