import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomRepository } from './room.repository';
import { RoomAvailabilityRepository } from './room-availability.repository';

@Module({
  controllers: [RoomsController],
  providers: [
    RoomsService,
    RoomRepository,
    RoomAvailabilityRepository,
  ],
  exports: [
    RoomsService,
    RoomRepository,
    RoomAvailabilityRepository,
  ],
})
export class RoomsModule {}
