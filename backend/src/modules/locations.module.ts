import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../common/decorators';
import { CreateLocationDto, UpdateLocationDto } from '../common/dto';
import {
  Inventory,
  Location,
  PickItem,
  ReceivingItem,
  StockMovement,
} from '../database/entities';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
  ) {}

  async findAll(params: { search?: string; warehouse?: string }) {
    const query = this.locationsRepository.createQueryBuilder('location').orderBy('location.id', 'ASC');
    if (params.search) {
      query.andWhere('(LOWER(location.code) LIKE :search OR LOWER(location.warehouse) LIKE :search)', {
        search: `%${params.search.toLowerCase()}%`,
      });
    }
    if (params.warehouse) {
      query.andWhere('location.warehouse = :warehouse', { warehouse: params.warehouse });
    }
    return query.getMany();
  }

  async findOne(id: number): Promise<Location> {
    const location = await this.locationsRepository.findOne({
      where: { id },
      relations: ['inventory', 'inventory.product'],
    });
    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }
    return location;
  }

  async warehouses(): Promise<string[]> {
    const rows = await this.locationsRepository
      .createQueryBuilder('location')
      .select('DISTINCT location.warehouse', 'warehouse')
      .orderBy('location.warehouse', 'ASC')
      .getRawMany<{ warehouse: string }>();
    return rows.map((row) => row.warehouse);
  }

  async create(dto: CreateLocationDto): Promise<Location> {
    const existing = await this.locationsRepository.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('A location with this code already exists');
    }
    const location = this.locationsRepository.create(dto);
    return this.locationsRepository.save(location);
  }

  async update(id: number, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.findOne(id);
    if (dto.code && dto.code !== location.code) {
      const existing = await this.locationsRepository.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new BadRequestException('A location with this code already exists');
      }
    }
    Object.assign(location, dto);
    return this.locationsRepository.save(location);
  }

  async remove(id: number): Promise<void> {
    const location = await this.findOne(id);
    // Keep movement history intact; deactivate bins that were ever used.
    const manager = this.locationsRepository.manager;
    const [inventory, movements, receiving, picking] = await Promise.all([
      manager.count(Inventory, { where: { locationId: id } }),
      manager.count(StockMovement, { where: { locationId: id } }),
      manager.count(ReceivingItem, { where: { locationId: id } }),
      manager.count(PickItem, { where: { locationId: id } }),
    ]);
    if (inventory + movements + receiving + picking > 0) {
      throw new BadRequestException(
        'This location has stock or transaction history. Deactivate it instead of deleting it.',
      );
    }
    await this.locationsRepository.remove(location);
  }
}

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  findAll(@Query() query: { search?: string; warehouse?: string }) {
    return this.locationsService.findAll(query);
  }

  @Get('warehouses')
  warehouses() {
    return this.locationsService.warehouses();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateLocationDto) {
    return this.locationsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Location])],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
