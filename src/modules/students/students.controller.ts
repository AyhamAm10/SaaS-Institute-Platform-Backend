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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('students')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class StudentsController {
  constructor(
    @Inject(StudentsService)
    private readonly studentsService: StudentsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: StudentQueryDto) {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.findById(id);
  }
}
