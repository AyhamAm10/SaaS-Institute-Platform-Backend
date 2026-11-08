import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { TransactionHelper } from '../../database/transaction.helper';
import { AuthService } from '../auth/auth.service';
import { FamilyRepository } from '../families/family.repository';
import { StudentRepository } from '../students/student.repository';
import { MobileAccountsRepository } from './mobile-accounts.repository';
import { MobileAccountQueryDto } from './dto/mobile-account-query.dto';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { CreateStudentAccountDto } from './dto/create-student-account.dto';
import { ResetMobilePasswordDto } from './dto/reset-mobile-password.dto';
import { MobileAccountItem } from './dto/mobile-account-response.dto';

const HASH_ROUNDS = 12;

@Injectable()
export class MobileAccountsService {
  constructor(
    @Inject(MobileAccountsRepository)
    private readonly repository: MobileAccountsRepository,
    @Inject(FamilyRepository)
    private readonly familyRepository: FamilyRepository,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async findAll(query: MobileAccountQueryDto) {
    return this.repository.findAccounts(query);
  }

  async findEligibleStudents(search?: string) {
    return this.repository.findStudentsWithoutAccount(search);
  }

  async createGuardian(dto: CreateGuardianAccountDto): Promise<MobileAccountItem> {
    const family = await this.familyRepository.findFamilyById(dto.familyId);
    Ensure.exists(family, 'Family');

    const phone = dto.phone.trim();
    const existing = await this.repository.findByPhone(phone);
    if (existing) {
      throw new ConflictException(
        ErrorMessages.get('mobile_account_phone_duplicate'),
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, HASH_ROUNDS);

    const userId = await this.transactionHelper.executeInTransaction(async () => {
      return this.repository.createGuardianAccount({
        familyId: dto.familyId,
        fullName: dto.fullName.trim(),
        phone,
        relationship: dto.relationship,
        passwordHash,
      });
    });

    const account = await this.repository.getAccountById(userId);
    Ensure.exists(account, 'User');
    return account;
  }

  async createStudent(dto: CreateStudentAccountDto): Promise<MobileAccountItem> {
    const student = await this.studentRepository.findStudentById(dto.studentId);
    Ensure.exists(student, 'Student');

    if (student.userId) {
      const existingUser = await this.repository.findMobileUserById(student.userId);
      if (existingUser && !existingUser.deletedAt) {
        throw new BadRequestException(
          ErrorMessages.get('student_already_has_account'),
        );
      }
    }

    const phone = dto.phone.trim();
    const existing = await this.repository.findByPhone(phone);
    if (existing) {
      throw new ConflictException(
        ErrorMessages.get('mobile_account_phone_duplicate'),
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, HASH_ROUNDS);

    const userId = await this.transactionHelper.executeInTransaction(async () => {
      return this.repository.createStudentAccount({
        studentId: student.id,
        fullName: student.fullName,
        phone,
        passwordHash,
      });
    });

    const account = await this.repository.getAccountById(userId);
    Ensure.exists(account, 'User');
    return account;
  }

  async resetPassword(
    userId: number,
    dto: ResetMobilePasswordDto,
  ): Promise<{ updated: boolean }> {
    const user = await this.repository.findMobileUserById(userId);
    Ensure.exists(user, 'User');

    const passwordHash = await bcrypt.hash(dto.password, HASH_ROUNDS);
    await this.repository.update(user.id, { passwordHash });
    await this.authService.logout(user.id);
    return { updated: true };
  }

  async deactivate(userId: number): Promise<{ deactivated: boolean }> {
    const user = await this.repository.findMobileUserById(userId);
    Ensure.exists(user, 'User');

    await this.transactionHelper.executeInTransaction(async () => {
      await this.repository.delete(user.id);
    });

    await this.authService.logout(user.id);
    return { deactivated: true };
  }
}

