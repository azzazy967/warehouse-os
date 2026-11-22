import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Inventory,
  Location,
  OrderStatuses,
  PickOrder,
  Product,
  ReceivingOrder,
  Shipment,
  ShipmentStatuses,
  StockMovement,
} from '../database/entities';

const FEED_PAGE_SIZE = 6;
const FEED_LIMIT = 12;
const UNCATEGORISED = 'Uncategorised';
const UNKNOWN_PRODUCT = 'Product';
const UNKNOWN_LOCATION = 'Location';
const UNKNOWN_REFERENCE = 'Pick order';

type InventoryWithRelations = Inventory & {
  product: Product;
  location: Location;
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Inventory) private readonly inventory: Repository<Inventory>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    @InjectRepository(ReceivingOrder) private readonly receiving: Repository<ReceivingOrder>,
    @InjectRepository(PickOrder) private readonly picking: Repository<PickOrder>,
    @InjectRepository(Shipment) private readonly shipping: Repository<Shipment>,
  ) {}

  async stats() {
    const [products, locations, inventoryRows, receivingCount, pickingCount, shippingCount] =
      await Promise.all([
        this.products.find(),
        this.locations.count(),
        this.inventory.find({ relations: ['product'] }),
        this.receiving.count({ where: { status: OrderStatuses.PENDING } }),
        this.picking.count({ where: { status: OrderStatuses.PENDING } }),
        this.shipping.count({ where: { status: ShipmentStatuses.PENDING } }),
      ]);

    let totalUnits = 0;
    let totalValue = 0;
    let lowStock = 0;
    let outOfStock = 0;
    const byProduct = new Map<number, number>();

    for (const row of inventoryRows) {
      totalUnits += row.quantityOnHand;
      totalValue += row.product ? row.quantityOnHand * Number(row.product.unitCost) : 0;
      byProduct.set(row.productId, (byProduct.get(row.productId) || 0) + row.quantityOnHand);
    }
    for (const product of products) {
      const onHand = byProduct.get(product.id) || 0;
      if (onHand === 0) outOfStock += 1;
      else if (onHand <= product.reorderLevel) lowStock += 1;
    }

    return {
      products: products.length,
      locations,
      totalUnits,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStock,
      outOfStock,
      pendingReceiving: receivingCount,
      pendingPicking: pickingCount,
      pendingShipping: shippingCount,
    };
  }

  async movementChart() {
    // Anchor every bucket to UTC midnight so keys and query bounds always agree.
    const today = new Date();
    const utcMidnight = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const since = new Date(utcMidnight - 6 * 86_400_000);

    const movements = await this.movements
      .createQueryBuilder('movement')
      .where('movement.createdAt >= :since', { since })
      .andWhere('movement.createdAt <= :until', { until: new Date() })
      .orderBy('movement.createdAt', 'ASC')
      .getMany();

    const days: Array<{ date: string; inbound: number; outbound: number }> = [];
    const index = new Map<string, number>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const key = new Date(utcMidnight - offset * 86_400_000).toISOString().slice(0, 10);
      index.set(key, days.length);
      days.push({ date: key, inbound: 0, outbound: 0 });
    }
    for (const movement of movements) {
      const key = new Date(movement.createdAt).toISOString().slice(0, 10);
      const position = index.get(key);
      if (position === undefined) continue;
      if (movement.quantity > 0) days[position].inbound += movement.quantity;
      else days[position].outbound += Math.abs(movement.quantity);
    }
    return days;
  }

  async recentMovements() {
    return this.movements.find({
      relations: ['product', 'location', 'user'],
      order: { createdAt: 'DESC' },
      take: 8,
    });
  }

  private buildTopProducts(rows: InventoryWithRelations[]) {
    const byProduct = new Map<number, { id: number; name: string; sku: string; value: number }>();
    for (const row of rows) {
      if (!row.product) continue;
      const current = byProduct.get(row.productId) || {
        id: row.productId,
        name: row.product.name,
        sku: row.product.sku,
        value: 0,
      };
      current.value += row.quantityOnHand * Number(row.product.unitCost);
      byProduct.set(row.productId, current);
    }
    return Array.from(byProduct.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((item) => ({ ...item, value: Math.round(item.value * 100) / 100 }));
  }

  async topProducts() {
    const rows = await this.inventory.find({ relations: ['product'] });
    return this.buildTopProducts(rows as InventoryWithRelations[]);
  }

  private collectStockTotals(inventoryRows: Inventory[]) {
    const onHandByProduct = new Map<number, number>();
    const reservedByProduct = new Map<number, number>();
    const byCategory = new Map<string, { units: number; value: number }>();
    const byLocation = new Map<number, {
      code: string;
      warehouse: string;
      zone: string | null;
      units: number;
      value: number;
    }>();

    for (const row of inventoryRows) {
      // LEFT JOINs can yield orphan rows; skip them instead of failing the whole endpoint.
      if (!row.product || !row.location) continue;
      const value = row.quantityOnHand * Number(row.product.unitCost);
      onHandByProduct.set(row.productId, (onHandByProduct.get(row.productId) || 0) + row.quantityOnHand);
      reservedByProduct.set(row.productId, (reservedByProduct.get(row.productId) || 0) + row.quantityReserved);

      const category = row.product.category?.trim() || UNCATEGORISED;
      const categoryEntry = byCategory.get(category) || { units: 0, value: 0 };
      categoryEntry.units += row.quantityOnHand;
      categoryEntry.value += value;
      byCategory.set(category, categoryEntry);

      const locationEntry = byLocation.get(row.locationId) || {
        code: row.location.code,
        warehouse: row.location.warehouse,
        zone: row.location.zone || null,
        units: 0,
        value: 0,
      };
      locationEntry.units += row.quantityOnHand;
      locationEntry.value += value;
      byLocation.set(row.locationId, locationEntry);
    }

    return { onHandByProduct, reservedByProduct, byCategory, byLocation };
  }

  private buildProductStock(
    products: Product[],
    onHandByProduct: Map<number, number>,
    reservedByProduct: Map<number, number>,
  ) {
    return products.map((product) => {
      const onHand = onHandByProduct.get(product.id) || 0;
      const reserved = reservedByProduct.get(product.id) || 0;
      const value = onHand * Number(product.unitCost);
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category || null,
        onHand,
        available: onHand - reserved,
        value: Math.round(value * 100) / 100,
        status: onHand === 0 ? 'OUT_OF_STOCK' : onHand <= product.reorderLevel ? 'LOW_STOCK' : 'IN_STOCK',
      };
    });
  }

  /** Aggregations that power KPI drill-downs, breakdown charts and the flow diagram. */
  async insights() {
    const [products, inventoryRows] = await Promise.all([
      this.products.find(),
      this.inventory.find({ relations: ['product', 'location'] }),
    ]);
    const { onHandByProduct, reservedByProduct, byCategory, byLocation } =
      this.collectStockTotals(inventoryRows);
    return {
      byCategory: Array.from(byCategory, ([category, data]) => ({
        category,
        units: data.units,
        value: Math.round(data.value * 100) / 100,
      })).sort((a, b) => b.value - a.value),
      byLocation: Array.from(byLocation.values())
        .map((data) => ({ ...data, value: Math.round(data.value * 100) / 100 }))
        .sort((a, b) => b.units - a.units),
      productStock: this.buildProductStock(products, onHandByProduct, reservedByProduct),
      topProducts: this.buildTopProducts(inventoryRows as InventoryWithRelations[]),
    };
  }

  private stamp(value: Date | string | null, fallback: Date) {
    // SQLite can hydrate datetime columns as strings; normalize both drivers to ISO.
    return (value ? new Date(value) : fallback).toISOString();
  }

  private activityEvents(
    receipts: ReceivingOrder[],
    picks: PickOrder[],
    shipments: Shipment[],
    movements: StockMovement[],
  ) {
    const completed = OrderStatuses.COMPLETED;
    return [
      ...receipts.map((order) => ({
        id: `receiving-${order.id}`,
        kind: 'receiving',
        title: `Receipt ${order.orderNumber}`,
        detail: order.supplier || '',
        status: order.status,
        at: this.stamp(order.status === completed ? order.receivedAt : null, order.createdAt),
      })),
      ...picks.map((order) => ({
        id: `picking-${order.id}`,
        kind: 'picking',
        title: `Pick ${order.orderNumber}`,
        detail: order.reference || UNKNOWN_REFERENCE,
        status: order.status,
        at: this.stamp(order.status === completed ? order.pickedAt : null, order.createdAt),
      })),
      ...shipments.map((shipment) => ({
        id: `shipping-${shipment.id}`,
        kind: 'shipping',
        title: `Shipment ${shipment.shipmentNumber}`,
        detail: shipment.destination || '',
        status: shipment.status,
        at: this.stamp(shipment.shippedAt, shipment.createdAt),
      })),
      ...movements.map((movement) => ({
        id: `movement-${movement.id}`,
        kind: 'movement',
        title: `${movement.type.replace(/_/g, ' ')} - ${movement.product?.name || UNKNOWN_PRODUCT}`,
        detail: movement.location?.code || UNKNOWN_LOCATION,
        status: movement.type,
        at: this.stamp(movement.createdAt, movement.createdAt),
      })),
    ];
  }

  /** Unified chronological feed across receipts, picks, shipments and stock movements. */
  async activity() {
    const [receipts, picks, shipments, movements] = await Promise.all([
      this.receiving.find({ order: { createdAt: 'DESC' }, take: FEED_PAGE_SIZE }),
      this.picking.find({ order: { createdAt: 'DESC' }, take: FEED_PAGE_SIZE }),
      this.shipping.find({ order: { createdAt: 'DESC' }, take: FEED_PAGE_SIZE }),
      this.movements.find({
        relations: ['product', 'location'],
        order: { createdAt: 'DESC' },
        take: FEED_PAGE_SIZE,
      }),
    ]);

    return this.activityEvents(receipts, picks, shipments, movements)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, FEED_LIMIT);
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  stats() {
    return this.dashboardService.stats();
  }

  @Get('movement-chart')
  movementChart() {
    return this.dashboardService.movementChart();
  }

  @Get('recent-movements')
  recentMovements() {
    return this.dashboardService.recentMovements();
  }

  @Get('top-products')
  topProducts() {
    return this.dashboardService.topProducts();
  }

  @Get('insights')
  insights() {
    return this.dashboardService.insights();
  }

  @Get('activity')
  activity() {
    return this.dashboardService.activity();
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Location,
      Inventory,
      StockMovement,
      ReceivingOrder,
      PickOrder,
      Shipment,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
