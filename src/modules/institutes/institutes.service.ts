import { Inject, Injectable } from '@nestjs/common';
import { User, Institute } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { InstituteRepository } from './institute.repository';
import { UserSystemRepository } from '../users/user-system.repository';
import { AcademicBranchesService } from '../academic-branches/academic-branches.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { InstituteWithAdminResponse } from './dto/institute-response.dto';
import { SafeUser } from '../auth/dto/auth-response.dto';
import { UserRole } from '../../common/types/user-role.enum';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { randomInt } from 'node:crypto';
import { SystemCacheService } from '../../infrastructure/cache/system-cache.service';
import { StudentStatusesService } from '../reference-data/student-statuses/student-statuses.service';
import { CacheKeys } from '../../infrastructure/cache/cache-keys';

/**
 * Service managing Institute lifecycle and Super Admin tenant provisioning.
 */
@Injectable()
export class InstitutesService {
  constructor(
    @Inject(InstituteRepository)
    private readonly instituteRepository: InstituteRepository,
    @Inject(UserSystemRepository)
    private readonly userSystemRepository: UserSystemRepository,
    @Inject(AcademicBranchesService)
    private readonly academicBranchesService: AcademicBranchesService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    @Inject(SystemCacheService)
    private readonly systemCache: SystemCacheService,
    @Inject(StudentStatusesService)
    private readonly studentStatusesService: StudentStatusesService,
  ) {}

  /**
   * Create an institute along with its initial administrator account atomically.
   *
   * Flow:
   *   1. Resolve the institute login code (given or generated) and ensure it is unique.
   *      Admin phone needs no global check — phones are unique per institute.
   *   2. Hash the administrator password with bcrypt (12 salt rounds).
   *   3. In an interactive database transaction:
   *      a. Create the Institute entity.
   *      b. Create the admin User entity with role INSTITUTE_ADMIN.
   *      c. Create the InstituteAdmin relational link.
   *      d. Automatically provision the default Arabic Academic Branches.
   *   4. Return the created Institute and sanitized admin user.
   */
  async createInstitute(
    dto: CreateInstituteDto,
  ): Promise<InstituteWithAdminResponse> {
    // 1. Resolve institute login code
    let code = dto.code;
    if (code) {
      Ensure.alreadyExists(
        await this.instituteRepository.findByCode(code),
        'Institute code',
      );
    } else {
      code = await this.generateInstituteCode();
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    // 3. Atomically create Institute, Admin User, InstituteAdmin link, and default Academic Branches
    return this.transactionHelper.executeInTransaction(async () => {
      const institute = await this.instituteRepository.create({
        code,
        name: dto.name,
        ...(dto.timezone && { timezone: dto.timezone }),
        logoUrl: dto.logoUrl ?? '',
        primaryColor: dto.primaryColor ?? '#1a73e8',
        secondaryColor: dto.secondaryColor ?? '#34a853',
        phone: dto.phone,
        address: dto.address,
      });

      const adminUser = await this.userSystemRepository.create({
        instituteId: institute.id,
        fullName: dto.adminFullName,
        phone: dto.adminPhone,
        passwordHash,
        role: UserRole.INSTITUTE_ADMIN,
      });

      await this.instituteRepository.createAdminLink(
        institute.id,
        adminUser.id,
      );

      // Automatically provision standard Arabic Academic Branches
      await this.academicBranchesService.provisionDefaultBranches(institute.id);
      await this.studentStatusesService.provisionDefaults(institute.id);

      return {
        institute,
        admin: this.toSafeUser(adminUser),
      };
    });
  }

  /**
   * Retrieve all institutes with pagination and optional search (for super admin).
   */
  async findAll(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<Institute>> {
    const where = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { phone: { contains: search.trim() } },
            { address: { contains: search.trim(), mode: 'insensitive' } },
          ],
        }
      : undefined;

    return this.instituteRepository.findManyPaginated(pagination, {
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        instituteAdmins: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            users: true,
            branches: true,
            sections: true,
            students: true,
          },
        },
      },
    });
  }

  /**
   * Retrieve an institute by ID with administrators.
   */
  async findById(id: number): Promise<Institute> {
    const institute = await this.instituteRepository.findByIdWithAdmins(id);
    Ensure.exists(institute, 'Institute');
    return institute;
  }

  /**
   * Update institute details (name, login code, branding, contact).
   */
  async update(id: number, dto: UpdateInstituteDto): Promise<Institute> {
    const existing = await this.findById(id);

    if (dto.code !== undefined && dto.code !== existing.code) {
      Ensure.alreadyExists(
        await this.instituteRepository.findByCode(dto.code),
        'Institute code',
      );
    }

    const data: Record<string, unknown> = {};
    for (const key of [
      'name',
      'code',
      'logoUrl',
      'primaryColor',
      'secondaryColor',
      'phone',
      'address',
      'timezone',
    ] as const) {
      const value = dto[key];
      if (value !== undefined) data[key] = value.trim();
    }
    if (data['name'] !== undefined) Ensure.required(data['name'], 'name');

    if (Object.keys(data).length > 0) {
      await this.instituteRepository.update(id, data);
      if (data['timezone'] !== undefined) {
        await this.systemCache.delForInstitute(
          id,
          CacheKeys.instituteTimezone,
          [],
        );
      }
    }
    return this.findById(id);
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      instituteId: user.instituteId,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /** Random unused code like "INS4K7Q2" (unambiguous characters only). */
  private async generateInstituteCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      let suffix = '';
      for (let i = 0; i < 5; i++)
        suffix += alphabet[randomInt(alphabet.length)];
      const code = `INS${suffix}`;
      if (!(await this.instituteRepository.findByCode(code))) return code;
    }
  }
}
