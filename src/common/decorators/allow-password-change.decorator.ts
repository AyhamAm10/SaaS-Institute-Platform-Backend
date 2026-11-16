import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChange';

/**
 * Routes a user may call while `mustChangePassword` is still set (change the
 * password, read the profile, sign out). Every other route answers 403
 * `password_change_required` until the password has been changed.
 */
export const AllowPasswordChange = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
