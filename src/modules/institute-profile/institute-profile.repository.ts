import { Inject, Injectable } from '@nestjs/common';
import { Institute } from '@prisma/client';
import { SystemRepository } from '../../database/system.repository';
import { PrismaService } from '../../database/prisma.service';

export interface InstituteProfileData {
  id: number;
  code: string;
  name: string;
  phone: string;
  address: string;
  timezone: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  createdAt: Date;
  updatedAt: Date;
}

const PROFILE_SELECT = {
  id: true,
  code: true,
  name: true,
  phone: true,
  address: true,
  timezone: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class InstituteProfileRepository extends SystemRepository<Institute> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'institute');
  }

  async findProfile(instituteId: number): Promise<InstituteProfileData | null> {
    return this.client.institute.findUnique({
      where: { id: instituteId },
      select: PROFILE_SELECT,
    });
  }

  async updateProfile(
    instituteId: number,
    data: { name?: string; phone?: string; address?: string; timezone?: string },
  ): Promise<InstituteProfileData> {
    return this.client.institute.update({
      where: { id: instituteId },
      data,
      select: PROFILE_SELECT,
    });
  }
}

