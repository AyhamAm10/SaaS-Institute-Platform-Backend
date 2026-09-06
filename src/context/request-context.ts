import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context data stored via AsyncLocalStorage.
 * Populated by RequestContextMiddleware (language) and JwtAuthGuard (user/institute).
 *
 * This is mutable within the same async context — the guard enriches the
 * initially empty context created by the middleware.
 */
import { ClientType } from '../common/types/client-type.enum';

export interface RequestContextData {
  userId: number;
  instituteId: number;
  role: string;
  language: string;
  clientType?: ClientType;
}

/**
 * Concurrency-safe request context using AsyncLocalStorage.
 *
 * Guarantees that concurrent requests cannot leak data into each other —
 * each request runs in its own async context with its own store.
 *
 * Usage:
 *   - Middleware calls `RequestContext.run()` to establish the context
 *   - Guard mutates the store in-place to set user/institute data
 *   - Repositories call `RequestContext.getInstituteId()` for tenant scoping
 *   - ErrorMessages calls `RequestContext.getLanguage()` for i18n
 */
export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<RequestContextData>();

  /** Run a function within a new async context. */
  static run<T>(context: RequestContextData, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** Get the current context, or undefined if outside a request. */
  static get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /** Get the current context or throw. */
  static getOrFail(): RequestContextData {
    const context = this.get();
    if (!context) {
      throw new Error(
        'RequestContext is not available. Ensure RequestContextMiddleware is applied.',
      );
    }
    return context;
  }

  static getUserId(): number {
    return this.getOrFail().userId;
  }

  static getInstituteId(): number {
    const ctx = this.getOrFail();
    if (!ctx.instituteId) {
      throw new Error(
        'Institute context is not available. This request may not be authenticated.',
      );
    }
    return ctx.instituteId;
  }

  static getRole(): string {
    return this.getOrFail().role;
  }

  static getLanguage(): string {
    return this.get()?.language ?? 'en';
  }

  static getClientType(): ClientType | undefined {
    return this.get()?.clientType;
  }
}
