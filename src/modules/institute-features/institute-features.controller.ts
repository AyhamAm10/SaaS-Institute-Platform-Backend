import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { InstituteFeaturesService } from './institute-features.service';
import { UpdateInstituteFeaturesDto } from './dto/update-institute-features.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Manage an institute's feature flags — restricted to SUPER_ADMIN role.
 */
@Controller('institutes/:instituteId/features')
@Roles(UserRole.SUPER_ADMIN)
export class InstituteFeaturesController {
  constructor(
    @Inject(InstituteFeaturesService)
    private readonly featuresService: InstituteFeaturesService,
  ) {}

  @Get()
  async findAll(@Param('instituteId', ParseIntPipe) instituteId: number) {
    return this.featuresService.getForInstitute(instituteId);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('instituteId', ParseIntPipe) instituteId: number,
    @Body() dto: UpdateInstituteFeaturesDto,
  ) {
    return this.featuresService.setForInstitute(instituteId, dto);
  }
}
