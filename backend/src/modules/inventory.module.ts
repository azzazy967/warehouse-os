import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/decorators';
import { AdjustInventoryDto, InventoryFiltersDto } from '../common/dto';
import {
  Inventory,
  Location,
  MovementType,
  Product,
  StockMovement,
} from '../database/entities';

export interface MovementInput {
  productId: number;
  locationId: number;
  quantityDelta: number;
  type: MovementType;
  reference?: string | null;
  notes?: string | null;
  userId?: number | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(StockMovement)
    private readonly movementsRepository: Repository<StockMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(params: InventoryFiltersDto) {
    const query = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('inventory.location', 'location')
      .orderBy('product.name', 'ASC');

    if (params.productId !== undefined) {
      query.andWhere('inventory.productId = :productId', { productId: params.productId });
    }
    if (params.locationId !== undefined) {
      query.andWhere('inventory.locationId = :locationId', { locationId: params.locationId });
    }

    const rows = await query.getMany();
    if (params.lowStock === 'true') {
      // Align with the product-level semantics used everywhere else in the API.
      const totals = new Map<number, number>();
      for (const row of rows) {
        totals.set(row.productId, (totals.get(row.productId) || 0) + row.quantityOnHand);
      }
      const lowProductIds = new Set(
        rows
          .filter((row) => (totals.get(row.productId) || 0) <= row.product.reorderLevel)
          .map((row) => row.productId),
      );
      return rows.filter((row) => lowProductIds.has(row.productId));
    }
    return rows;
  }

  async findByProduct(productId: number) {
    return this.inventoryRepository.find({
      where: { productId },
      relations: ['location', 'product'],
      order: { quantityOnHand: 'DESC' },
    });
  }

  async summary() {
    const rows = await this.inventoryRepository.find({ relations: ['product', 'location'] });
    const byProduct = new Map<number, any>();
    for (const row of rows) {
      const current = byProduct.get(row.productId) || {
        productId: row.productId,
        sku: row.product.sku,
        name: row.product.name,
        category: row.product.category,
        unitOfMeasure: row.product.unitOfMeasure,
        reorderLevel: row.product.reorderLevel,
        unitCost: Number(row.product.unitCost),
        quantityOnHand: 0,
        quantityReserved: 0,
        locations: 0,
      };
      current.quantityOnHand += row.quantityOnHand;
      current.quantityReserved += row.quantityReserved;
      current.locations += 1;
      byProduct.set(row.productId, current);
    }
    return Array.from(byProduct.values()).map((item) => {
      const available = item.quantityOnHand - item.quantityReserved;
      return {
        ...item,
        available,
        stockValue: item.quantityOnHand * item.unitCost,
        status:
          available === 0
            ? 'OUT_OF_STOCK'
            : available <= item.reorderLevel
              ? 'LOW_STOCK'
              : 'IN_STOCK',
      };
    });
  }

  async adjust(dto: AdjustInventoryDto, userId: number) {
    const magnitude = Math.abs(dto.quantity);
    if (magnitude === 0) {
      throw new BadRequestException('Adjustment quantity cannot be zero');
    }
    // Only ADJUSTMENT uses a signed quantity; all other types must be positive.
    if (dto.type !== 'ADJUSTMENT' && dto.quantity < 0) {
      throw new BadRequestException(
        `Quantity must be positive for ${dto.type} movements`,
      );
    }
    let delta: number;
    switch (dto.type) {
      case 'RECEIPT':
      case 'RETURN':
        delta = magnitude;
        break;
      case 'PICK':
      case 'SHIPMENT':
        delta = -magnitude;
        break;
      case 'ADJUSTMENT':
        delta = dto.quantity; // signed: negative deducts stock
        break;
      default:
        throw new BadRequestException('Unsupported movement type');
    }

    return this.dataSource.transaction(async (manager) =>
      this.applyMovement(manager, {
        productId: dto.productId,
        locationId: dto.locationId,
        quantityDelta: delta,
        type: dto.type as MovementType,
        reference: dto.reference || 'MANUAL_ADJUSTMENT',
        notes: dto.notes || null,
        userId,
      }),
    );
  }

  /** Guarded, single-statement balance change; works on both SQLite and Postgres. */
  private increment(
    manager: EntityManager,
    productId: number,
    locationId: number,
    delta: number,
  ) {
    return manager
      .createQueryBuilder()
      .update(Inventory)
      .set({ quantityOnHand: () => '"quantityOnHand" + :delta' })
      .where(
        '"productId" = :productId AND "locationId" = :locationId AND "quantityOnHand" - "quantityReserved" + :delta >= 0',
        { productId, locationId, delta },
      )
      .execute();
  }

  /**
   * Applies a stock delta and writes the matching audit movement atomically.
   * Callers own the surrounding transaction so entire documents stay consistent.
   */
  async applyMovement(manager: EntityManager, input: MovementInput): Promise<Inventory> {
    const product = await manager.findOne(Product, { where: { id: input.productId } });
    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }
    const location = await manager.findOne(Location, {
      where: { id: input.locationId, isActive: true },
    });
    if (!location) {
      throw new NotFoundException(`Location ${input.locationId} not found or inactive`);
    }

    const delta = input.quantityDelta;
    const result = await this.increment(manager, input.productId, input.locationId, delta);

    if (result.affected === 0) {
      if (delta < 0) {
        throw new BadRequestException(
          `Insufficient stock for ${product.sku} at ${location.code}`,
        );
      }
      // First receipt for this bin: insert, tolerating a concurrent insert race.
      try {
        await manager
          .createQueryBuilder()
          .insert()
          .into(Inventory)
          .values({
            productId: input.productId,
            locationId: input.locationId,
            quantityOnHand: delta,
            quantityReserved: 0,
          })
          .execute();
      } catch (error) {
        const retry = await this.increment(manager, input.productId, input.locationId, delta);
        if (retry.affected === 0) throw error;
      }
    }

    const inventory = await manager.findOne(Inventory, {
      where: { productId: input.productId, locationId: input.locationId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory row could not be loaded after movement');
    }

    await manager.save(
      manager.create(StockMovement, {
        productId: input.productId,
        locationId: input.locationId,
        type: input.type,
        quantity: delta,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId: input.userId ?? null,
      }),
    );
    return inventory;
  }

  /**
   * Plans deductions from bins holding the product, largest available first.
   * Reserved units are never consumed.
   */
  async deductAcrossLocations(
    manager: EntityManager,
    productId: number,
    quantity: number,
  ): Promise<Array<{ locationId: number; quantity: number }>> {
    if (quantity <= 0) return [];
    const rows = await manager.find(Inventory, {
      where: { productId },
      order: { quantityOnHand: 'DESC' },
    });
    const available = (row: Inventory) => row.quantityOnHand - row.quantityReserved;
    const usable = rows.filter((row) => available(row) > 0);
    const totalAvailable = usable.reduce((sum, row) => sum + available(row), 0);
    if (totalAvailable < quantity) {
      const product = await manager.findOne(Product, { where: { id: productId } });
      throw new BadRequestException(
        `Insufficient stock for ${product?.sku ?? productId}. Available: ${totalAvailable}, requested: ${quantity}`,
      );
    }

    let remaining = quantity;
    const deductions: Array<{ locationId: number; quantity: number }> = [];
    for (const row of usable) {
      if (remaining <= 0) break;
      const take = Math.min(available(row), remaining);
      deductions.push({ locationId: row.locationId, quantity: take });
      remaining -= take;
    }
    return deductions;
  }
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(@Query() query: InventoryFiltersDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('summary')
  summary() {
    return this.inventoryService.summary();
  }

  @Get('product/:productId')
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.inventoryService.findByProduct(productId);
  }

  @Post('adjust')
  @Roles('ADMIN', 'MANAGER')
  adjust(@Body() dto: AdjustInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.adjust(dto, user.id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, StockMovement])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
