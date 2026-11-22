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
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/decorators';
import { CreateShipmentDto } from '../common/dto';
import { generateNumber } from '../common/helpers';
import { Shipment, ShipmentItem, ShipmentStatuses } from '../database/entities';
import { InventoryModule, InventoryService } from './inventory.module';

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentsRepository: Repository<Shipment>,
    @InjectRepository(ShipmentItem)
    private readonly itemsRepository: Repository<ShipmentItem>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll() {
    return this.shipmentsRepository.find({
      relations: ['items', 'items.product', 'shippedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Shipment> {
    const shipment = await this.shipmentsRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'shippedBy'],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }
    return shipment;
  }

  async create(dto: CreateShipmentDto) {
    const shipment = this.shipmentsRepository.create({
      shipmentNumber: generateNumber('SHP'),
      carrier: dto.carrier,
      trackingNumber: dto.trackingNumber || null,
      destination: dto.destination,
      notes: dto.notes || null,
      status: ShipmentStatuses.PENDING,
      items: dto.items.map((item) =>
        this.itemsRepository.create({
          productId: item.productId,
          quantity: item.quantity,
          quantityShipped: 0,
        }),
      ),
    });
    return this.shipmentsRepository.save(shipment);
  }

  async ship(id: number, userId: number) {
    await this.dataSource.transaction(async (manager) => {
      // Atomic claim prevents two concurrent ship calls from double-deducing stock.
      const claimed = await manager
        .createQueryBuilder()
        .update(Shipment)
        .set({ status: ShipmentStatuses.PROCESSING })
        .where('id = :id AND status = :pending', {
          id,
          pending: ShipmentStatuses.PENDING,
        })
        .execute();
      if (claimed.affected !== 1) {
        const existing = await manager.findOne(Shipment, { where: { id } });
        if (!existing) throw new NotFoundException(`Shipment ${id} not found`);
        throw new BadRequestException(`Shipment is already ${existing.status.toLowerCase()}`);
      }

      const shipment = await manager.findOne(Shipment, {
        where: { id },
        relations: ['items'],
      });
      if (!shipment) throw new NotFoundException(`Shipment ${id} not found`);

      for (const item of shipment.items) {
        const deductions = await this.inventoryService.deductAcrossLocations(
          manager,
          item.productId,
          item.quantity,
        );
        for (const deduction of deductions) {
          await this.inventoryService.applyMovement(manager, {
            productId: item.productId,
            locationId: deduction.locationId,
            quantityDelta: -deduction.quantity,
            type: 'SHIPMENT',
            reference: shipment.shipmentNumber,
            notes: `Shipped to ${shipment.destination} via ${shipment.carrier}`,
            userId,
          });
        }
        // Accumulate so partial shipments remain consistent in the audit trail.
        item.quantityShipped += item.quantity;
        await manager.save(item);
      }
      shipment.status = ShipmentStatuses.SHIPPED;
      shipment.shippedAt = new Date();
      shipment.shippedById = userId;
      await manager.save(shipment);
    });

    return this.findOne(id);
  }

  async markDelivered(id: number) {
    const result = await this.shipmentsRepository
      .createQueryBuilder()
      .update(Shipment)
      .set({ status: ShipmentStatuses.DELIVERED })
      .where('id = :id AND status = :shipped', { id, shipped: ShipmentStatuses.SHIPPED })
      .execute();
    if (result.affected !== 1) {
      throw new BadRequestException('Only shipped shipments can be marked delivered');
    }
    return this.findOne(id);
  }

  async cancel(id: number) {
    const result = await this.shipmentsRepository
      .createQueryBuilder()
      .update(Shipment)
      .set({ status: ShipmentStatuses.CANCELLED })
      .where('id = :id AND status = :pending', { id, pending: ShipmentStatuses.PENDING })
      .execute();
    if (result.affected !== 1) {
      throw new BadRequestException('A shipped shipment cannot be cancelled');
    }
    return this.findOne(id);
  }
}

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get()
  findAll() {
    return this.shippingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shippingService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateShipmentDto) {
    return this.shippingService.create(dto);
  }

  @Post(':id/ship')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER')
  ship(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.shippingService.ship(id, user.id);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER')
  deliver(@Param('id', ParseIntPipe) id: number) {
    return this.shippingService.markDelivered(id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.shippingService.cancel(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Shipment, ShipmentItem]), InventoryModule],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
