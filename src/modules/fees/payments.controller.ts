import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CancelPaymentDto, PaymentQueryDto } from './dto/payment.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Payments list, receipts and cancellation. Payments are never deleted. */
@Controller('payments')
@RequireResource(Resource.Fees)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Get()
  async findAll(@Query() query: PaymentQueryDto) {
    return this.payments.findAll(query);
  }

  @Get('by-receipt/:number')
  async byReceipt(@Param('number', ParseIntPipe) receiptNumber: number) {
    return this.payments.findByReceipt(receiptNumber);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.payments.findDetails(id);
  }

  @Patch(':id/cancel')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelPaymentDto,
  ) {
    return this.payments.cancel(id, dto);
  }
}
