import { RequestContext } from '../../context/request-context';

/**
 * Every background job carries the tenant it belongs to, so the worker can
 * rebuild RequestContext and keep repositories isolated (role.md §14.2).
 */
export interface TenantJobData {
  instituteId: number;
  /** User who triggered the job (0 for scheduled system jobs). */
  userId: number;
}

/**
 * Attaches the caller's institute and user to a job payload.
 * Producers MUST build job data with this helper, never set `instituteId` by hand.
 */
export function tenantJobData<T extends object>(payload: T): T & TenantJobData {
  const ctx = RequestContext.getOrFail();
  return { ...payload, instituteId: ctx.instituteId, userId: ctx.userId };
}
