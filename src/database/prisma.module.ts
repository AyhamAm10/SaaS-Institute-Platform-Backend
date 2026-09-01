import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TransactionHelper } from './transaction.helper';

/**
 * Global module providing PrismaService and TransactionHelper.
 * Available in all modules without explicit imports.
 */
@Global()
@Module({
  providers: [PrismaService, TransactionHelper],
  exports: [PrismaService, TransactionHelper],
})
export class PrismaModule {}
