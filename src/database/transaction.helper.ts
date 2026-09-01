import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TransactionContext } from './transaction.context';

/**
 * Wrapper around Prisma's interactive transactions using AsyncLocalStorage.
 *
 * When code runs inside `executeInTransaction()`, ALL repository operations
 * automatically use the transaction client (via TransactionContext).
 * No manual wiring or client-passing is needed.
 *
 * Usage:
 *   await this.transactionHelper.executeInTransaction(async () => {
 *     await this.userRepo.create({ ... });
 *     await this.profileRepo.create({ ... });
 *     // If anything throws, both operations are rolled back.
 *   });
 */
@Injectable()
export class TransactionHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute a function inside a Prisma interactive transaction.
   *
   * @param fn      - The function to execute. All repository calls inside
   *                  this function automatically use the transaction client.
   * @param options - Optional Prisma transaction options (maxWait, timeout).
   */
  async executeInTransaction<T>(
    fn: () => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Store the transaction client in AsyncLocalStorage so repositories
      // pick it up automatically via `this.client` in BaseRepository.
      return TransactionContext.run(tx as Record<string, unknown>, fn);
    }, options);
  }
}
