import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudentsModule } from '../students/students.module';
import { SectionsModule } from '../sections/sections.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { QueueNames } from '../../infrastructure/queue/queue-names';
import { ContractsController } from './contracts.controller';
import { PaymentsController } from './payments.controller';
import { ContractsService } from './contracts.service';
import { PaymentsService } from './payments.service';
import { FeesReportsService } from './fees-reports.service';
import { FeesReportDataService } from './fees-report-data.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { ReceiptSequenceRepository } from './repositories/receipt-sequence.repository';
import { FeesProcessor } from './jobs/fees.processor';

/** Student fees: contracts, installments, payments and receipts (E10). */
@Module({
  imports: [
    StudentsModule,
    SectionsModule,
    InstitutesModule,
    BullModule.registerQueue({ name: QueueNames.fees }),
  ],
  controllers: [ContractsController, PaymentsController],
  providers: [
    ContractsService,
    PaymentsService,
    FeesReportsService,
    FeesReportDataService,
    SubscriptionRepository,
    InstallmentRepository,
    PaymentRepository,
    ReceiptSequenceRepository,
    FeesProcessor,
  ],
  exports: [
    ContractsService,
    PaymentsService,
    FeesReportsService,
    FeesReportDataService,
  ],
})
export class FeesModule {}
