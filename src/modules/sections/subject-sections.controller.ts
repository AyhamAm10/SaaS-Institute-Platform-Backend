import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Where a subject is taught (subject detail page). */
@Controller('subjects')
@RequireResource(Resource.Academic)
export class SubjectSectionsController {
  constructor(
    @Inject(SectionsService) private readonly sections: SectionsService,
  ) {}

  @Get(':id/sections')
  async placements(@Param('id', ParseIntPipe) id: number) {
    return this.sections.findBySubject(id);
  }
}
