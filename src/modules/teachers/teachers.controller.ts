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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { TeacherQualificationDto } from './dto/teacher-assignment.dto';
import { SetTeacherAvailabilityDto } from './dto/teacher-availability.dto';
import { ResetStaffPasswordDto } from '../staff/dto/staff.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

@Controller('teachers')
@RequireResource(Resource.Academic)
export class TeachersController {
  constructor(
    @Inject(TeachersService)
    private readonly teachersService: TeachersService,
  ) {}

  @Post()
  async create(@Body() dto: CreateTeacherDto) {
    return this.teachersService.create(dto);
  }

  @Get()
  async findAll(@Query() query: TeacherQueryDto) {
    return this.teachersService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.teachersService.update(id, dto);
  }

  @Patch(':id/active')
  @HttpCode(HttpStatus.OK)
  async toggleActive(
    @Param('id', ParseIntPipe) id: number,
    @Body('isActive') isActive: boolean,
  ) {
    return this.teachersService.toggleActive(id, isActive);
  }

  @Post(':id/assignments')
  async assignQualification(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TeacherQualificationDto,
  ) {
    return this.teachersService.assignQualification(id, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(HttpStatus.OK)
  async removeQualification(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
  ) {
    return this.teachersService.removeQualification(id, assignmentId);
  }

  @Post(':id/availability')
  @HttpCode(HttpStatus.OK)
  async setAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTeacherAvailabilityDto,
  ) {
    return this.teachersService.setAvailability(id, dto.availabilities);
  }

  @Get(':id/availability')
  async getAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.getAvailability(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetStaffPasswordDto,
  ) {
    return this.teachersService.resetPassword(id, dto);
  }
}
