import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface CallOptions {
  /** Expected HTTP status (default: any 2xx). */
  status?: number;
  headers?: Record<string, string>;
}

/** The error body of a refused call (`ErrorMessages` key and text). */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/**
 * HTTP client of one signed-in user (or anonymous). Every call asserts its status
 * and returns the parsed body, so a test reads like the API documentation.
 */
export class Api {
  constructor(
    private readonly app: INestApplication,
    private token: string | null = null,
    private readonly context: Record<string, string> = {},
    /**
     * Signs the same user in again. Access tokens live 15 minutes and scenarios
     * move the clock by hours, so an expired token is renewed transparently once.
     */
    private readonly relogin?: () => Promise<string>,
  ) {}

  /** Same user with operational context headers (branch / academic year). */
  withContext(ctx: { branchId?: number; academicYearId?: number }): Api {
    return new Api(this.app, this.token, {
      ...this.context,
      ...(ctx.branchId !== undefined && { 'X-Branch-Id': String(ctx.branchId) }),
      ...(ctx.academicYearId !== undefined && { 'X-Academic-Year-Id': String(ctx.academicYearId) }),
    }, this.relogin);
  }

  private send(method: Method, path: string, body: unknown, headers: Record<string, string> = {}) {
    let req = request(this.app.getHttpServer())[method](`/api${path}`)
      .set('X-Client-Type', 'mobile')
      .set('Accept-Language', 'en');
    if (this.token) req = req.set('Authorization', `Bearer ${this.token}`);
    for (const [k, v] of Object.entries({ ...this.context, ...headers })) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  }

  async call<T = any>(method: Method, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
    let res = await this.send(method, path, body, opts.headers);
    const expired = res.status === 401 && /expired/i.test(JSON.stringify(res.body));
    if (expired && this.relogin && opts.status !== 401) {
      this.token = await this.relogin();
      res = await this.send(method, path, body, opts.headers);
    }
    const ok = opts.status !== undefined ? res.status === opts.status : res.status >= 200 && res.status < 300;
    if (!ok) {
      throw new Error(
        `${method.toUpperCase()} ${path} -> ${res.status} (expected ${opts.status ?? '2xx'}): ${JSON.stringify(res.body).slice(0, 600)}`,
      );
    }
    return res.body as T;
  }

  get<T = any>(path: string, opts?: CallOptions) { return this.call<T>('get', path, undefined, opts); }
  post<T = any>(path: string, body: unknown = {}, opts?: CallOptions) { return this.call<T>('post', path, body, opts); }
  patch<T = any>(path: string, body: unknown = {}, opts?: CallOptions) { return this.call<T>('patch', path, body, opts); }
  put<T = any>(path: string, body: unknown = {}, opts?: CallOptions) { return this.call<T>('put', path, body, opts); }
  del<T = any>(path: string, body?: unknown, opts?: CallOptions) { return this.call<T>('delete', path, body, opts); }

  /** Asserts a refusal and returns the error body (status and message key are checked by the caller). */
  fails(method: Method, path: string, status: number, body?: unknown): Promise<ApiError> {
    return this.call<ApiError>(method, path, body, { status });
  }
}

/**
 * Unique 10-digit phone numbers (09 + 8 digits). Each worker process starts in its
 * own million-wide block (by pid) at a random offset, so parallel files never collide.
 */
let phoneSeq = (process.pid % 80) * 1_000_000 + Math.floor(Math.random() * 900_000);
export function uniquePhone(): string {
  phoneSeq += 1;
  return `09${10_000_000 + phoneSeq}`;
}

/**
 * Waits for something that happens after the response (domain events write
 * notifications in the background). Polls with REAL timers (only Date is faked).
 */
export async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const until = performance.now() + timeoutMs;
  let last = await read();
  while (!accept(last)) {
    if (performance.now() > until) return last;
    await new Promise((r) => setTimeout(r, 50));
    last = await read();
  }
  return last;
}
