/**
 * Identifier for the calling client type.
 *
 * Used exclusively for token delivery strategy (HttpOnly cookies vs JSON payload).
 * Must NEVER be used for authorization, permissions, or tenant scoping.
 */
export enum ClientType {
  WEB = 'web',
  MOBILE = 'mobile',
}
