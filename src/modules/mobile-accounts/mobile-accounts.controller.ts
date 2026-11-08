import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';
import { MobileAccountsService } from './mobile-accounts.service';
import { MobileAccountQueryDto } from './dto/mobile-account-query.dto';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { CreateStudentAccountDto } from './dto/create-student-account.dto';
import { ResetMobilePasswordDto } from './dto/reset-mobile-password.dto';

@Controller('mobile-accounts')
@RequireResource(Resource.Students)
export class MobileAccountsController {
  constructor(
    @Inject(MobileAccountsService)
    private readonly service: MobileAccountsService,
  ) {}

  @Get()
  async findAll(@Query() query: MobileAccountQueryDto) {
    return this.service.findAll(query);
  }

  @Get('eligible-students')
  async findEligibleStudents(@Query('search') search?: string) {
    return this.service.findEligibleStudents(search);
  }

  @Post('guardians')
  async createGuardian(@Body() dto: CreateGuardianAccountDto) {
    return this.service.createGuardian(dto);
  }

  @Post('students')
  async createStudent(@Body() dto: CreateStudentAccountDto) {
    return this.service.createStudent(dto);
  }

  @Post(':userId/reset-password')
  async resetPassword(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ResetMobilePasswordDto,
  ) {
    return this.service.resetPassword(userId, dto);
  }

  @Delete(':userId')
  async deactivate(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.deactivate(userId);
  }
}

