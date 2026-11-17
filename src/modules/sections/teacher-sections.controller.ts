import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Sections and subjects a teacher is assigned to (teacher detail page). */
@Controller('teachers')
@RequireResource(Resource.Academic)
export class TeacherSectionsController {
  constructor(
    @Inject(SectionsService) private readonly sections: SectionsService,
  ) {}

  @Get(':id/sections')
  async taughtBy(@Param('id', ParseIntPipe) id: number) {
    return this.sections.findTaughtBy(id);
  }
}
