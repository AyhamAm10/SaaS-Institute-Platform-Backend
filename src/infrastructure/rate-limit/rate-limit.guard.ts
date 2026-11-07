import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../../common/errors/error-messages';
import { RateLimitStore } from './rate-limit.store';
import {
  RateLimitConfig,
  RateLimitPolicy,
  resolveRateLimitConfig,
} from './rate-limit.config';
import { LOGIN_RATE_LIMIT_FIELD } from './rate-limit.decorators';

interface HttpRequestLike {
  ip?: string;
  socket?: { remoteAddress?: string };
  body?: Record<string, unknown>;
}

interface HttpResponseLike {
  setHeader(name: string, value: string | number): void;
}

/**
 * Global rate-limit guard (registered before the auth guards).
 * - default policy: per client IP, on every route.
 * - login policy: on routes marked @LoginRateLimit(field), per IP + that body
 *   field, so a phone number cannot be brute-forced.
 * Over the limit → 429 with `Retry-After` and the unified Arabic / English message.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly config: RateLimitConfig;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitStore) private readonly store: RateLimitStore,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.config = resolveRateLimitConfig(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<HttpRequestLike>();
    const res = context.switchToHttp().getResponse<HttpResponseLike>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

    await this.enforce(res, `default:${ip}`, this.config.default);

    const field = this.reflector.getAllAndOverride<string | undefined>(
      LOGIN_RATE_LIMIT_FIELD,
      [context.getHandler(), context.getClass()],
    );
    if (field) {
      const value = String(req.body?.[field] ?? '');
      await this.enforce(res, `login:${ip}:${value}`, this.config.login);
    }

    return true;
  }

  private async enforce(
    res: HttpResponseLike,
    key: string,
    policy: RateLimitPolicy,
  ): Promise<void> {
    const result = await this.store.hit(key, policy.windowMs, policy.limit);
    if (!result.blocked) return;

    res.setHeader('Retry-After', result.retryAfterSeconds);
    throw new HttpException(
      ErrorMessages.get('too_many_requests'),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
