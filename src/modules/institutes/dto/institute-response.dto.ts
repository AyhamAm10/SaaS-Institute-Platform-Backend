import { Institute } from '@prisma/client';
import { SafeUser } from '../../auth/dto/auth-response.dto';

/**
 * Response structure for created institute and its administrator.
 */
export interface InstituteWithAdminResponse {
  institute: Institute;
  admin: SafeUser;
}
