import { Inject, Injectable } from '@nestjs/common';
import { RoomAvailability } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RoomAvailabilityRepository extends TenantAwareRepository<RoomAvailability> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'roomAvailability');
  }

  async findByRoom(roomId: number): Promise<RoomAvailability[]> {
    const instituteId = this.getInstituteId();
    return (this.client as any).roomAvailability.findMany({
      where: { instituteId, roomId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async replaceAvailabilities(
    roomId: number,
    windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ): Promise<RoomAvailability[]> {
    const instituteId = this.getInstituteId();
    const client = this.client as any;

    await client.roomAvailability.deleteMany({
      where: { instituteId, roomId },
    });

    if (windows.length === 0) {
      return [];
    }

    await client.roomAvailability.createMany({
      data: windows.map((w) => ({
        instituteId,
        roomId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    });

    return this.findByRoom(roomId);
  }
}
