import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Ensure } from './ensure';
import { RequestContext } from '../../context/request-context';

describe('Ensure utility & ErrorMessages i18n', () => {
  it('Ensure.exists throws NotFoundException with resource name when null or undefined', () => {
    expect(() => Ensure.exists(null, 'User')).toThrow(NotFoundException);
    expect(() => Ensure.exists(undefined, 'Institute')).toThrow(NotFoundException);
    expect(() => Ensure.exists({ id: 1 }, 'User')).not.toThrow();
  });

  it('Ensure.exists respects language context (Arabic & English)', () => {
    // Default English
    expect(() => Ensure.exists(null, 'User')).toThrow('User not found');

    // Arabic context
    RequestContext.run({ userId: 1, instituteId: 1, role: 'ADMIN', language: 'ar' }, () => {
      expect(() => Ensure.exists(null, 'User')).toThrow('User غير موجود');
    });
  });

  it('Ensure.required throws BadRequestException when empty', () => {
    expect(() => Ensure.required('', 'email')).toThrow(BadRequestException);
    expect(() => Ensure.required(null, 'email')).toThrow(BadRequestException);
    expect(() => Ensure.required('admin@school.com', 'email')).not.toThrow();
  });

  it('Ensure.alreadyExists throws ConflictException when value is defined', () => {
    expect(() => Ensure.alreadyExists({ id: 1 }, 'User')).toThrow(ConflictException);
    expect(() => Ensure.alreadyExists(null, 'User')).not.toThrow();
    expect(() => Ensure.alreadyExists(undefined, 'User')).not.toThrow();
  });

  it('Ensure.unauthorized throws UnauthorizedException when condition is true', () => {
    expect(() => Ensure.unauthorized(true, 'Invalid token')).toThrow(UnauthorizedException);
    expect(() => Ensure.unauthorized(false, 'Invalid token')).not.toThrow();
  });

  it('Ensure.forbidden throws ForbiddenException when condition is true', () => {
    expect(() => Ensure.forbidden(true)).toThrow(ForbiddenException);
    expect(() => Ensure.forbidden(false)).not.toThrow();
  });

  it('Ensure.isNumber verifies numeric types', () => {
    expect(() => Ensure.isNumber('123', 'id')).toThrow(BadRequestException);
    expect(() => Ensure.isNumber(NaN, 'id')).toThrow(BadRequestException);
    expect(() => Ensure.isNumber(10, 'id')).not.toThrow();
  });

  it('Ensure.isArray verifies array types', () => {
    expect(() => Ensure.isArray('not-an-array', 'items')).toThrow(BadRequestException);
    expect(() => Ensure.isArray([1, 2, 3], 'items')).not.toThrow();
  });
});
