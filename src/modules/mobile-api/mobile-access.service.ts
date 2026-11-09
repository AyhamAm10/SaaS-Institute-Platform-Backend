import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import { RequestContext } from '../../context/request-context';
import { MobileAccountsService } from '../mobile-accounts/mobile-accounts.service';
import { StudentsService } from '../students/students.service';
import {
  MobileStudentOwner,
  MobileStudentRow,
} from '../students/student.repository';
import { MobileContextService } from './mobile-context.service';

/** The authenticated, verified-live mobile account behind a request. */
export interface MobileCaller {
  userId: number;
  role: UserRole.FAMILY | UserRole.STUDENT;
  fullName: string;
  phone: string;
}

/**
 * Ownership: the caller is derived ONLY from the JWT (RequestContext). A
 * guardian reaches the students of the families they are linked to, a
 * student only the record whose `userId` is theirs. Anything else is a 404
 * (existence is never revealed). Deactivated users, deleted students and
 * deleted families are never served.
 */
@Injectable()
export class MobileAccessService {
  constructor(
    @Inject(MobileAccountsService)
    private readonly accounts: MobileAccountsService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(MobileContextService) private readonly context: MobileContextService,
  ) {}

  /** The live account of the token; role in the token must match the database. */
  async caller(): Promise<MobileCaller> {
    const { userId, role } = RequestContext.getOrFail();
    const account = await this.accounts.getActiveAccount(userId);
    Ensure.unauthorized(
      account.role !== role ||
        (role !== UserRole.FAMILY && role !== UserRole.STUDENT),
      ErrorMessages.get('mobile_account_inactive'),
    );
    return {
      userId: account.id,
      role: account.role as MobileCaller['role'],
      fullName: account.fullName,
      phone: account.phone,
    };
  }

  /** Every child the caller owns (one for a student account). */
  async children(caller: MobileCaller): Promise<MobileStudentRow[]> {
    return this.find(caller);
  }

  /** One owned child, or 404 (also for somebody else's child). */
  async child(caller: MobileCaller, studentId: number): Promise<MobileStudentRow> {
    const [child] = await this.find(caller, studentId);
    Ensure.exists(child, 'Student');
    return child;
  }

  private async find(
    caller: MobileCaller,
    studentId?: number,
  ): Promise<MobileStudentRow[]> {
    const owner = await this.ownerOf(caller);
    // No header branch / year: the child's own record decides (see MobileContextService)
    return this.context.runNeutral(() => this.students.findForMobile(owner, studentId));
  }

  private async ownerOf(caller: MobileCaller): Promise<MobileStudentOwner> {
    if (caller.role === UserRole.STUDENT) return { userId: caller.userId };
    return { familyIds: await this.accounts.getGuardianFamilyIds(caller.userId) };
  }
}
