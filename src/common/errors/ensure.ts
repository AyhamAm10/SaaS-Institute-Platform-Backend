import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorMessages } from './error-messages';

/**
 * Clean business-validation utility.
 *
 * Throws the appropriate NestJS HTTP exception with an i18n-resolved message.
 * Services use this instead of scattered `throw new Error(...)` calls.
 *
 * Methods with `asserts` return types let TypeScript narrow the type after the call:
 *   Ensure.exists(user, 'user'); // after this line, `user` is guaranteed non-null
 */
export class Ensure {
  /** Throw 404 if value is null/undefined. */
  static exists<T>(
    value: T | null | undefined,
    resourceName: string,
  ): asserts value is T {
    if (value === null || value === undefined) {
      throw new NotFoundException(
        ErrorMessages.get('not_found', { resource: resourceName }),
      );
    }
  }

  /** Throw 400 if value is null/undefined/empty-string. */
  static required<T>(
    value: T | null | undefined,
    fieldName: string,
  ): asserts value is NonNullable<T> {
    if (value === null || value === undefined || value === '') {
      throw new BadRequestException(
        ErrorMessages.get('required', { field: fieldName }),
      );
    }
  }

  /** Throw 409 if value IS defined (i.e. resource already exists). */
  static alreadyExists(value: unknown, resourceName: string): void {
    if (value !== null && value !== undefined) {
      throw new ConflictException(
        ErrorMessages.get('already_exists', { resource: resourceName }),
      );
    }
  }

  /** Throw 401 if condition is true. */
  static unauthorized(condition: boolean, message?: string): void {
    if (condition) {
      throw new UnauthorizedException(
        message ?? ErrorMessages.get('unauthorized'),
      );
    }
  }

  /** Throw 403 if condition is true. */
  static forbidden(condition: boolean, message?: string): void {
    if (condition) {
      throw new ForbiddenException(
        message ?? ErrorMessages.get('forbidden'),
      );
    }
  }

  /** Throw 400 if value is not a number. */
  static isNumber(value: unknown, fieldName: string): asserts value is number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(
        ErrorMessages.get('invalid_type_number', { field: fieldName }),
      );
    }
  }

  /** Throw 400 if value is not an array. */
  static isArray(value: unknown, fieldName: string): asserts value is unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        ErrorMessages.get('invalid_type_array', { field: fieldName }),
      );
    }
  }

  /** Throw a configurable HTTP exception if condition is true. */
  static custom(
    condition: boolean,
    message: string,
    statusCode: number = 400,
  ): void {
    if (condition) {
      throw new HttpException(message, statusCode);
    }
  }
}
