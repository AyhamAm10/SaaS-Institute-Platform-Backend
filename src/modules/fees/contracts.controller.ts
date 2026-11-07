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
import { ContractsService } from './contracts.service';
import { PaymentsService } from './payments.service';
import { FeesReportsService } from './fees-reports.service';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { OverdueQueryDto } from './dto/overdue-query.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Student contracts, their payments and the fee reports (role.md §10.3). */
@Controller()
@RequireResource(Resource.Fees)
export class ContractsController {
  constructor(
    @Inject(ContractsService) private readonly contracts: ContractsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(FeesReportsService) private readonly reports: FeesReportsService,
  ) {}

  /** Installment schedule of a contract, without saving. */
  @Post('enrollments/:id/contract/preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param('id', ParseIntPipe) enrollmentId: number,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.preview(enrollmentId, dto);
  }

  @Post('enrollments/:id/contract')
  async create(
    @Param('id', ParseIntPipe) enrollmentId: number,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.create(enrollmentId, dto);
  }

  @Get('students/:id/contracts')
  async findByStudent(@Param('id', ParseIntPipe) studentId: number) {
    return this.contracts.findByStudent(studentId);
  }

  /** Required / paid / remaining / overdue, one row per currency. */
  @Get('students/:id/financial-summary')
  async summary(@Param('id', ParseIntPipe) studentId: number) {
    return this.reports.getStudentSummary(studentId);
  }

  @Get('contracts/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.findDetails(id);
  }

  /** Discount and unpaid installments only. */
  @Patch('contracts/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(id, dto);
  }

  @Post('contracts/:id/payments')
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payments.create(id, dto);
  }

  @Get('installments/overdue')
  async overdue(@Query() query: OverdueQueryDto) {
    return this.reports.findOverdue(query);
  }

  @Get(['fees/overdue/summary', 'installments/overdue/summary'])
  async overdueSummary() {
    return this.reports.getOverdueAging();
  }
}
