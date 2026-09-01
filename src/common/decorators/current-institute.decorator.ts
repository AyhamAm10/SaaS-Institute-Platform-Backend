import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';

/**
 * Parameter decorator that extracts the current institute ID from the
 * request context (AsyncLocalStorage).
 *
 * Usage:
 *   @Get('branches')
 *   getBranches(@CurrentInstituteId() instituteId: number) { ... }
 */
export const CurrentInstituteId = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): number => {
    return RequestContext.getInstituteId();
  },
);
