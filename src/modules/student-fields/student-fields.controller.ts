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
import { StudentFieldsService } from './student-fields.service';
import { CreateStudentFieldDto } from './dto/create-student-field.dto';
import { UpdateStudentFieldDto } from './dto/update-student-field.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('student-fields')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class StudentFieldsController {
  constructor(
    @Inject(StudentFieldsService)
    private readonly fieldsService: StudentFieldsService,
  ) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.fieldsService.findAll(includeInactive === 'true');
  }

  @Post()
  async create(@Body() dto: CreateStudentFieldDto) {
    return this.fieldsService.create(dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentFieldDto,
  ) {
    return this.fieldsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.fieldsService.delete(id);
  }
}
