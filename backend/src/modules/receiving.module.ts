import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateReceivingDto,
  ReceiveDto,
  ReceiveLineDto,
  UpdateReceivingNotesDto,
} from '../common/dto';
import { generateNumber } from '../common/helpers';
import {
  Location,
  OrderStatuses,
  ReceivingItem,
  ReceivingOrder,
} from '../database/entities';
import { InventoryModule, InventoryService } from './inventory.module';

@Injectable()
export class ReceivingService {
  constructor(
    @InjectRepository(ReceivingOrder)
    private readonly ordersRepository: Repository<ReceivingOrder>,
    @InjectRepository(ReceivingItem)
    private readonly itemsRepository: Repository<ReceivingItem>,
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll() {
    return this.ordersRepository.find({
      relations: ['items', 'items.product', 'items.location', 'receivedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ReceivingOrder> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'items.location', 'receivedBy'],
    });
    if (!order) {
      throw new NotFoundException(`Receiving order ${id} not found`);
    }
    return order;
  }

  async create(dto: CreateReceivingDto) {
    const order = this.ordersRepository.create({
      orderNumber: generateNumber('RCV'),
      supplier: dto.supplier,
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
      notes: dto.notes || null,
      status: OrderStatuses.PENDING,
      items: dto.items.map((item) =>
        this.itemsRepository.create({
          productId: item.productId,
          locationId: item.locationId ?? null,
          quantityExpected: item.quantityExpected,
          quantityReceived: 0,
          notes: item.notes || null,
        }),
      ),
    });
    return this.ordersRepository.save(order);
  }

  async receive(id: number, dto: ReceiveDto, userId: number) {
    await this.dataSource.transaction(async (manager) => {
      // Atomic claim: exactly one concurrent caller may transition PENDING.
      const claimed = await manager
        .createQueryBuilder()
        .update(ReceivingOrder)
        .set({ status: OrderStatuses.PROCESSING })
        .where('id = :id AND status = :pending', { id, pending: OrderStatuses.PENDING })
        .execute();
      if (claimed.affected !== 1) {
        const existing = await manager.findOne(ReceivingOrder, { where: { id } });
        if (!existing) throw new NotFoundException(`Receiving order ${id} not found`);
        throw new BadRequestException(`Receiving order is ${existing.status.toLowerCase()}`);
      }

      const order = await manager.findOne(ReceivingOrder, {
        where: { id },
        relations: ['items'],
      });
      if (!order) throw new NotFoundException(`Receiving order ${id} not found`);

      const requested = new Map<number, ReceiveLineDto>();
      for (const line of dto.items) {
        if (requested.has(line.itemId)) {
          throw new BadRequestException('Duplicate receiving line');
        }
        requested.set(line.itemId, line);
      }
      const validIds = new Set(order.items.map((item) => item.id));
      for (const line of dto.items) {
        if (!validIds.has(line.itemId)) {
          throw new BadRequestException(`Line ${line.itemId} does not belong to this order`);
        }
      }

      const defaultLocation = await manager.findOne(Location, {
        where: { isActive: true },
        order: { id: 'ASC' },
      });
      if (!defaultLocation) {
        throw new BadRequestException('Create at least one active location before receiving stock');
      }

      for (const item of order.items) {
        const line = requested.get(item.id);
        if (!line || line.quantityReceived <= 0) continue;
        const remaining = item.quantityExpected - item.quantityReceived;
        if (line.quantityReceived > remaining) {
          throw new BadRequestException(
            `Cannot receive more than the remaining quantity for product ${item.productId}`,
          );
        }
        const locationId = line.locationId || item.locationId || defaultLocation.id;
        await this.inventoryService.applyMovement(manager, {
          productId: item.productId,
          locationId,
          quantityDelta: line.quantityReceived,
          type: 'RECEIPT',
          reference: order.orderNumber,
          notes: `Received from ${order.supplier}`,
          userId,
        });
        item.quantityReceived += line.quantityReceived;
        item.locationId = locationId;
        await manager.save(item);
      }

      const fullyReceived = order.items.every(
        (item) => item.quantityReceived >= item.quantityExpected,
      );
      order.status = fullyReceived ? OrderStatuses.COMPLETED : OrderStatuses.PENDING;
      if (fullyReceived) {
        order.receivedAt = new Date();
        order.receivedById = userId;
      }
      await manager.save(order);
    });

    // Re-read after commit so the caller sees the updated status and quantities.
    return this.findOne(id);
  }

  async cancel(id: number) {
    const result = await this.ordersRepository
      .createQueryBuilder()
      .update(ReceivingOrder)
      .set({ status: OrderStatuses.CANCELLED })
      .where('id = :id AND status IN (:...cancellable)', {
        id,
        cancellable: [OrderStatuses.DRAFT, OrderStatuses.PENDING, OrderStatuses.ASSIGNED],
      })
      .execute();
    if (result.affected !== 1) {
      const existing = await this.findOne(id);
      throw new BadRequestException(
        existing.status === OrderStatuses.COMPLETED
          ? 'A completed receiving order cannot be cancelled'
          : `Receiving order is ${existing.status.toLowerCase()}`,
      );
    }
    return this.findOne(id);
  }

  async patchNotes(id: number, notes: string) {
    const order = await this.findOne(id);
    order.notes = notes;
    return this.ordersRepository.save(order);
  }
}

@Controller('receiving')
export class ReceivingController {
  constructor(private readonly receivingService: ReceivingService) {}

  @Get()
  findAll() {
    return this.receivingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.receivingService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateReceivingDto) {
    return this.receivingService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  patch(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReceivingNotesDto) {
    return this.receivingService.patchNotes(id, dto.notes);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER')
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceiveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receivingService.receive(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.receivingService.cancel(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ReceivingOrder, ReceivingItem, Location]), InventoryModule],
  controllers: [ReceivingController],
  providers: [ReceivingService],
  exports: [ReceivingService],
})
export class ReceivingModule {}
