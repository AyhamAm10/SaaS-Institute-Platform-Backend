import {
  Body,
  Controller,
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
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';
import { AccountsService } from './accounts.service';
import {
  AccountsQueryDto,
  CreateStudentAccountDto,
  SetAccountActiveDto,
} from './dto/accounts.dto';

/**
 * Accounts of the institute (staff, teachers, families, students): list,
 * reset to the default password, switch on / off. Administration only.
 */
@Controller('accounts')
@RequireResource(Resource.Staff)
export class AccountsController {
  constructor(
    @Inject(AccountsService) private readonly service: AccountsService,
  ) {}

  @Get()
  async findAll(@Query() query: AccountsQueryDto) {
    return this.service.findAll(query);
  }

  @Get('summary')
  async summary() {
    return this.service.summary();
  }

  /** Creates the guardian accounts of every family with a phone and none yet. */
  @Post('families/sync')
  @HttpCode(HttpStatus.OK)
  async syncFamilies() {
    return this.service.syncFamilies();
  }

  @Get('eligible-students')
  async eligibleStudents(@Query('search') search?: string) {
    return this.service.findEligibleStudents(search);
  }

  @Post('students')
  async createStudent(@Body() dto: CreateStudentAccountDto) {
    return this.service.createStudentAccount(dto);
  }

  /** Back to the default password (no body); the next sign-in forces a change. */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Param('id', ParseIntPipe) id: number) {
    return this.service.resetPassword(id);
  }

  @Patch(':id/active')
  async setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAccountActiveDto,
  ) {
    return this.service.setActive(id, dto.isActive);
  }
}
