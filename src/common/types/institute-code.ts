/** Login code of the platform (super admin) institute. */
export const PLATFORM_INSTITUTE_CODE = 'PLATFORM';

/** Institute codes: 3–20 latin letters, digits or dashes, stored upper-case. */
export const INSTITUTE_CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;

/** Normalizes user input to the stored institute code form. */
export function normalizeInstituteCode(code: string): string {
  return code.trim().toUpperCase();
}
