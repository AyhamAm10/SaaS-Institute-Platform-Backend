import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('families')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class FamiliesController {
  constructor(
    @Inject(FamiliesService)
    private readonly familiesService: FamiliesService,
  ) {}

  @Post()
  async create(@Body() dto: CreateFamilyDto) {
    return this.familiesService.create(dto);
  }

  @Get()
  async search(@Query('search') search?: string) {
    return this.familiesService.search(search);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.familiesService.findById(id);
  }
}
