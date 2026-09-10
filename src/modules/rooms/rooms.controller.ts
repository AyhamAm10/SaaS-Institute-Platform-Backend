import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomQueryDto } from './dto/room-query.dto';
import { SetRoomAvailabilityDto } from './dto/room-availability.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('rooms')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class RoomsController {
  constructor(
    @Inject(RoomsService)
    private readonly roomsService: RoomsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: RoomQueryDto) {
    return this.roomsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.update(id, dto);
  }

  @Patch(':id/active')
  @HttpCode(HttpStatus.OK)
  async toggleActive(
    @Param('id', ParseIntPipe) id: number,
    @Body('isActive') isActive: boolean,
  ) {
    return this.roomsService.toggleActive(id, isActive);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.roomsService.delete(id);
    return { success: true };
  }

  @Post(':id/availability')
  @HttpCode(HttpStatus.OK)
  async setAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRoomAvailabilityDto,
  ) {
    return this.roomsService.setAvailability(id, dto.availabilities);
  }

  @Get(':id/availability')
  async getAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.getAvailability(id);
  }
}
