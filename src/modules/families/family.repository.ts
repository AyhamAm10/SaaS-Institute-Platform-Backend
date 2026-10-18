import { Inject, Injectable } from '@nestjs/common';
import { Family, Prisma } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FamilyRepository extends TenantAwareRepository<Family> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'family');
  }

  async search(searchQuery?: string): Promise<Family[]> {
    const instituteId = this.getInstituteId();
    const where: Prisma.FamilyWhereInput = { instituteId };

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      where.OR = [
        { familyName: { contains: q, mode: 'insensitive' } },
        { fatherName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    return (this.client as any).family.findMany({
      where,
      include: {
        _count: {
          select: { students: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findFamilyById(id: number): Promise<(Family & { _count?: { students: number } }) | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).family.findFirst({
      where: { id, instituteId },
      include: {
        students: {
          select: { id: true, fullName: true, gender: true, birthDate: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
  }
}
