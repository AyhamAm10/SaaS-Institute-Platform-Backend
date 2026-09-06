import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientType } from '../types/client-type.enum';

/**
 * Parameter decorator that extracts and validates the `X-Client-Type` header.
 *
 * Requirements:
 * - Must be present and strictly equal to either 'web' or 'mobile'.
 * - Case-insensitive ('Web', 'WEB', 'web' -> 'web').
 * - Throws BadRequestException if missing or invalid.
 */
export const ClientTypeHeader = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientType => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const rawHeader = request.headers['x-client-type'];

    if (!rawHeader) {
      throw new BadRequestException(
        'X-Client-Type header is required and must be either "web" or "mobile"',
      );
    }

    const value = (
      Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    )
      ?.trim()
      .toLowerCase();

    if (value !== ClientType.WEB && value !== ClientType.MOBILE) {
      throw new BadRequestException(
        'X-Client-Type header must be either "web" or "mobile"',
      );
    }

    return value as ClientType;
  },
);
