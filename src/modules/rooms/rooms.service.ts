import { Inject, Injectable } from '@nestjs/common';
import { RoomRepository } from './room.repository';
import { RoomAvailabilityRepository } from './room-availability.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomQueryDto } from './dto/room-query.dto';
import { RoomAvailabilityItemDto } from './dto/room-availability.dto';

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

@Injectable()
export class RoomsService {
  constructor(
    @Inject(RoomRepository)
    private readonly roomRepository: RoomRepository,
    @Inject(RoomAvailabilityRepository)
    private readonly availabilityRepository: RoomAvailabilityRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Validate availability time intervals for consistency and overlap prevention.
   */
  validateAvailabilityWindows(windows: RoomAvailabilityItemDto[]): void {
    const windowsByDay: Record<number, RoomAvailabilityItemDto[]> = {};

    for (const w of windows) {
      Ensure.custom(
        w.dayOfWeek < 0 || w.dayOfWeek > 6,
        ErrorMessages.get('invalid_day_of_week'),
        400,
      );

      const startMins = parseTimeToMinutes(w.startTime);
      const endMins = parseTimeToMinutes(w.endTime);

      Ensure.custom(
        startMins >= endMins,
        ErrorMessages.get('invalid_time_range'),
        400,
      );

      if (!windowsByDay[w.dayOfWeek]) {
        windowsByDay[w.dayOfWeek] = [];
      }
      windowsByDay[w.dayOfWeek]!.push(w);
    }

    // Check overlaps per day
    for (const day in windowsByDay) {
      const dayWindows = [...windowsByDay[day]!].sort(
        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
      );

      for (let i = 1; i < dayWindows.length; i++) {
        const prevEnd = parseTimeToMinutes(dayWindows[i - 1]!.endTime);
        const currStart = parseTimeToMinutes(dayWindows[i]!.startTime);
        Ensure.custom(
          currStart < prevEnd,
          ErrorMessages.get('overlapping_availability'),
          400,
        );
      }
    }
  }

  async create(dto: CreateRoomDto) {
    const trimmedName = dto.name.trim();
    Ensure.required(trimmedName, 'name');

    const existing = await this.roomRepository.findByName(trimmedName);
    Ensure.custom(
      Boolean(existing),
      ErrorMessages.get('room_name_duplicate'),
      409,
    );

    if (dto.availabilities && dto.availabilities.length > 0) {
      this.validateAvailabilityWindows(dto.availabilities);
    }

    return this.transactionHelper.executeInTransaction(async () => {
      const room = await this.roomRepository.create({
        name: trimmedName,
        code: dto.code?.trim() || null,
        capacity: dto.capacity || 30,
        type: dto.type?.trim() || 'CLASSROOM',
        isActive: true,
      });

      if (dto.availabilities && dto.availabilities.length > 0) {
        const client = (this.roomRepository as any).client;
        const instituteId = this.roomRepository.getInstituteId();
        await client.roomAvailability.createMany({
          data: dto.availabilities.map((a) => ({
            instituteId,
            roomId: room.id,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        });
      }

      return this.roomRepository.findByIdWithDetails(room.id);
    });
  }

  async update(id: number, dto: UpdateRoomDto) {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      Ensure.required(trimmedName, 'name');
      if (trimmedName !== room.name) {
        const duplicate = await this.roomRepository.findByName(trimmedName);
        Ensure.custom(
          Boolean(duplicate && duplicate.id !== id),
          ErrorMessages.get('room_name_duplicate'),
          409,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.code !== undefined) updateData['code'] = dto.code ? dto.code.trim() : null;
    if (dto.capacity !== undefined) updateData['capacity'] = dto.capacity;
    if (dto.type !== undefined) updateData['type'] = dto.type ? dto.type.trim() : null;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    await this.roomRepository.update(id, updateData);
    return this.roomRepository.findByIdWithDetails(id);
  }

  async toggleActive(id: number, isActive: boolean) {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');
    return this.roomRepository.update(id, { isActive });
  }

  async delete(id: number): Promise<void> {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');

    const count = await this.roomRepository.countTimetableEntries(id);
    Ensure.custom(
      count > 0,
      ErrorMessages.get('room_has_timetables'),
      400,
    );

    await this.roomRepository.delete(id);
  }

  async findAll(query: RoomQueryDto) {
    return this.roomRepository.findAllFiltered(query);
  }

  async findById(id: number) {
    const room = await this.roomRepository.findByIdWithDetails(id);
    Ensure.exists(room, 'Room');
    return room;
  }

  async setAvailability(roomId: number, windows: RoomAvailabilityItemDto[]) {
    const room = await this.roomRepository.findById(roomId);
    Ensure.exists(room, 'Room');

    this.validateAvailabilityWindows(windows);

    return this.availabilityRepository.replaceAvailabilities(roomId, windows);
  }

  async getAvailability(roomId: number) {
    const room = await this.roomRepository.findById(roomId);
    Ensure.exists(room, 'Room');
    return this.availabilityRepository.findByRoom(roomId);
  }
}
