/**
 * Every account the system creates (staff, teacher, guardian, student) starts
 * with this password and `mustChangePassword = true`: the first sign-in forces
 * a new password. A reset by the administration puts it back.
 */
export const DEFAULT_ACCOUNT_PASSWORD = '12345678';

/** Minimum length of a password the user chooses. */
export const ACCOUNT_PASSWORD_MIN = 8;

/** bcrypt cost shared by every account flow. */
export const PASSWORD_HASH_ROUNDS = 12;
