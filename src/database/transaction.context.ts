import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Stores the active Prisma transaction client in AsyncLocalStorage.
 *
 * When a transaction is active, repositories automatically use the
 * transaction client instead of the regular PrismaService. This makes
 * transactions transparent to service/repository code:
 *
 *   await transactionHelper.executeInTransaction(async () => {
 *     // All repository calls inside this callback automatically
 *     // use the transaction client — no manual wiring needed.
 *     await userRepo.create({ ... });
 *     await profileRepo.create({ ... });
 *   });
 */
export class TransactionContext {
  // The stored value is a Prisma transaction client, which has the same
  // model accessor API as PrismaClient but operates within a transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static readonly storage = new AsyncLocalStorage<Record<string, any>>();

  /** Run a function within a transaction context. */
  static run<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: Record<string, any>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.storage.run(client, fn);
  }

  /** Get the active transaction client, or undefined if not in a transaction. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static get(): Record<string, any> | undefined {
    return this.storage.getStore();
  }
}
