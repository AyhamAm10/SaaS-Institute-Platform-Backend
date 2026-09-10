import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { RoomQueryDto } from './dto/room-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

@Injectable()
export class RoomRepository extends TenantAwareRepository<Room> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'room');
  }

  async findByName(name: string): Promise<Room | null> {
    return this.findOne({ name });
  }

  async findRawById(id: number): Promise<Room | null> {
    return (this.client as any).room.findUnique({
      where: { id },
    });
  }

  async countTimetableEntries(roomId: number): Promise<number> {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetableEntry.count({
      where: { instituteId, roomId },
    });
  }

  async findByIdWithDetails(id: number) {
    const instituteId = this.getInstituteId();
    return (this.client as any).room.findFirst({
      where: { id, instituteId },
      include: {
        availabilities: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: {
            timetableEntries: true,
          },
        },
      },
    });
  }

  async findAllFiltered(query: RoomQueryDto): Promise<PaginatedResult<any>> {
    const instituteId = this.getInstituteId();
    const where: Prisma.RoomWhereInput = {
      instituteId,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.type && query.type.trim()) {
      where.type = query.type.trim();
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { code: { contains: s, mode: 'insensitive' } },
      ];
    }

    return this.findManyPaginated(query, {
      where,
      include: {
        availabilities: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: {
            timetableEntries: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }
}
