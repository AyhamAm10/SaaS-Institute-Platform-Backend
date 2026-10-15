import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { RoomQueryDto } from './dto/room-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

@Injectable()
export class RoomRepository extends ContextScopedRepository<Room> {
  protected override readonly branchKey = 'branchId';

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'room');
  }

  async findByName(name: string, branchId?: number): Promise<Room | null> {
    const where: Record<string, unknown> = { name };
    if (branchId !== undefined) {
      where['branchId'] = branchId;
    }
    return this.findOne(where);
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
    return (this.client as any).room.findFirst({
      where: this.scopeWhere({ id }),
      include: {
        branch: { select: { id: true, name: true, code: true } },
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

    if (query.branchId !== undefined) {
      where.branchId = query.branchId;
    }

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
        branch: { select: { id: true, name: true, code: true } },
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
