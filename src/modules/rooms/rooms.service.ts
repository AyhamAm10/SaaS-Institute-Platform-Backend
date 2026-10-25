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
import { BranchRepository } from '../branches/branch.repository';
import { RequestContext } from '../../context/request-context';

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

@Injectable()
export class RoomsService {
  constructor(
    @Inject(RoomRepository)
    private readonly roomRepository: RoomRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
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
        (a, b) =>
          parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
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

    // Resolve & Validate Branch (priority: DTO > RequestContext header > Default Branch)
    const targetBranchId = dto.branchId ?? RequestContext.getBranchId();
    let branchId: number;
    if (targetBranchId) {
      const branch = await this.branchRepository.findById(targetBranchId);
      if (!branch) {
        const rawBranch =
          await this.branchRepository.findRawById(targetBranchId);
        Ensure.custom(
          rawBranch !== null,
          ErrorMessages.get('branch_mismatch'),
          400,
        );
        Ensure.exists(null, 'Branch');
      }
      branchId = targetBranchId;
    } else {
      const defaultBranch =
        await this.branchRepository.getOrCreateDefaultBranch();
      branchId = defaultBranch.id;
    }

    const existing = await this.roomRepository.findByName(
      trimmedName,
      branchId,
    );
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
        branchId,
        capacity: dto.capacity || 30,
        type: dto.type?.trim() || 'CLASSROOM',
        isActive: true,
      });

      if (dto.availabilities && dto.availabilities.length > 0) {
        await this.availabilityRepository.replaceAvailabilities(
          room.id,
          dto.availabilities,
        );
      }

      return this.roomRepository.findByIdWithDetails(room.id);
    });
  }

  async update(id: number, dto: UpdateRoomDto) {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');

    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && room.branchId !== contextBranchId),
      ErrorMessages.get('room_branch_mismatch'),
      400,
    );

    const targetBranchId = dto.branchId ?? room.branchId;
    if (dto.branchId !== undefined && dto.branchId !== room.branchId) {
      const branch = await this.branchRepository.findById(dto.branchId);
      if (!branch) {
        const rawBranch = await this.branchRepository.findRawById(dto.branchId);
        Ensure.custom(
          rawBranch !== null,
          ErrorMessages.get('branch_mismatch'),
          400,
        );
        Ensure.exists(null, 'Branch');
      }
    }

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      Ensure.required(trimmedName, 'name');
      if (trimmedName !== room.name || targetBranchId !== room.branchId) {
        const duplicate = await this.roomRepository.findByName(
          trimmedName,
          targetBranchId,
        );
        Ensure.custom(
          Boolean(duplicate && duplicate.id !== id),
          ErrorMessages.get('room_name_duplicate'),
          409,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.branchId !== undefined) updateData['branchId'] = dto.branchId;
    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.capacity !== undefined) updateData['capacity'] = dto.capacity;
    if (dto.type !== undefined)
      updateData['type'] = dto.type ? dto.type.trim() : null;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    await this.roomRepository.update(id, updateData);
    return this.roomRepository.findByIdWithDetails(id);
  }

  async toggleActive(id: number, isActive: boolean) {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');

    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && room.branchId !== contextBranchId),
      ErrorMessages.get('room_branch_mismatch'),
      400,
    );

    return this.roomRepository.update(id, { isActive });
  }

  async delete(id: number): Promise<void> {
    const room = await this.roomRepository.findById(id);
    Ensure.exists(room, 'Room');

    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && room.branchId !== contextBranchId),
      ErrorMessages.get('room_branch_mismatch'),
      400,
    );

    const count = await this.roomRepository.countTimetableEntries(id);
    Ensure.custom(count > 0, ErrorMessages.get('room_has_timetables'), 400);

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

    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && room.branchId !== contextBranchId),
      ErrorMessages.get('room_branch_mismatch'),
      400,
    );

    this.validateAvailabilityWindows(windows);

    return this.availabilityRepository.replaceAvailabilities(roomId, windows);
  }

  async getAvailability(roomId: number) {
    const room = await this.roomRepository.findById(roomId);
    Ensure.exists(room, 'Room');

    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && room.branchId !== contextBranchId),
      ErrorMessages.get('room_branch_mismatch'),
      400,
    );

    return this.availabilityRepository.findByRoom(roomId);
  }
}
