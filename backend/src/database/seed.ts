import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { getDatabaseOptions } from '../config/database.config';
import {
  Inventory,
  Location,
  PickItem,
  PickOrder,
  Product,
  ReceivingItem,
  ReceivingOrder,
  Shipment,
  ShipmentItem,
  StockMovement,
  User,
  entities,
} from './entities';

const productsSeed = [
  { sku: 'EL-1001', name: 'Wireless Barcode Scanner', category: 'Electronics', unitCost: 189.5, reorderLevel: 15, unitOfMeasure: 'EA', weight: 0.35 },
  { sku: 'EL-1002', name: 'Label Printer, Thermal', category: 'Electronics', unitCost: 245.0, reorderLevel: 10, unitOfMeasure: 'EA', weight: 2.1 },
  { sku: 'EL-1003', name: 'Handheld Terminal', category: 'Electronics', unitCost: 512.75, reorderLevel: 8, unitOfMeasure: 'EA', weight: 0.48 },
  { sku: 'PK-2001', name: 'Corrugated Carton, Medium', category: 'Packaging', unitCost: 1.25, reorderLevel: 200, unitOfMeasure: 'EA', weight: 0.22 },
  { sku: 'PK-2002', name: 'Stretch Wrap Roll', category: 'Packaging', unitCost: 12.4, reorderLevel: 60, unitOfMeasure: 'ROLL', weight: 5.0 },
  { sku: 'PK-2003', name: 'Packing Tape, Clear', category: 'Packaging', unitCost: 2.8, reorderLevel: 100, unitOfMeasure: 'ROLL', weight: 0.18 },
  { sku: 'OF-3001', name: 'Safety Gloves, Large', category: 'Safety', unitCost: 6.9, reorderLevel: 80, unitOfMeasure: 'PAIR', weight: 0.09 },
  { sku: 'OF-3002', name: 'High-Visibility Vest', category: 'Safety', unitCost: 14.5, reorderLevel: 40, unitOfMeasure: 'EA', weight: 0.16 },
  { sku: 'HM-4001', name: 'Pallet Jack, 2500kg', category: 'Handling', unitCost: 429.0, reorderLevel: 5, unitOfMeasure: 'EA', weight: 62.0 },
  { sku: 'HM-4002', name: 'Plastic Pallet, 1200x800', category: 'Handling', unitCost: 38.0, reorderLevel: 30, unitOfMeasure: 'EA', weight: 12.5 },
  { sku: 'ST-5001', name: 'Storage Shelf Unit, 5 Tier', category: 'Storage', unitCost: 156.0, reorderLevel: 12, unitOfMeasure: 'EA', weight: 24.0 },
  { sku: 'ST-5002', name: 'Plastic Storage Bin, Blue', category: 'Storage', unitCost: 9.75, reorderLevel: 90, unitOfMeasure: 'EA', weight: 0.6 },
];

const locationsSeed = [
  { code: 'WH1-A-01-01', warehouse: 'Main Warehouse', zone: 'A', aisle: '01', rack: '01', bin: '01', type: 'RACK', capacity: 500 },
  { code: 'WH1-A-01-02', warehouse: 'Main Warehouse', zone: 'A', aisle: '01', rack: '01', bin: '02', type: 'RACK', capacity: 500 },
  { code: 'WH1-A-02-01', warehouse: 'Main Warehouse', zone: 'A', aisle: '02', rack: '01', bin: '01', type: 'RACK', capacity: 500 },
  { code: 'WH1-B-01-01', warehouse: 'Main Warehouse', zone: 'B', aisle: '01', rack: '01', bin: '01', type: 'FLOOR', capacity: 200 },
  { code: 'WH1-C-03-01', warehouse: 'Main Warehouse', zone: 'C', aisle: '03', rack: '01', bin: '01', type: 'SHELF', capacity: 300 },
  { code: 'WH2-A-01-01', warehouse: 'North Depot', zone: 'A', aisle: '01', rack: '01', bin: '01', type: 'RACK', capacity: 400 },
  { code: 'WH2-B-02-01', warehouse: 'North Depot', zone: 'B', aisle: '02', rack: '01', bin: '01', type: 'SHELF', capacity: 250 },
];

const INITIAL_STOCK = [
  [42, 18, 0, 7], [12, 6, 0, 0], [4, 2, 0, 0], [240, 120, 80, 0],
  [38, 22, 0, 0], [65, 30, 0, 12], [95, 40, 0, 0], [28, 0, 0, 0],
  [3, 0, 0, 0], [45, 20, 0, 0], [9, 0, 0, 0], [110, 60, 0, 25],
];

async function seedRow(manager: EntityManager) {
  const admin = await manager.save(
    manager.create(User, {
      name: 'Amina Hassan',
      email: 'admin@warehouse.io',
      password: await bcrypt.hash('Admin@123', 10),
      role: 'ADMIN',
    }),
  );
  const managerUser = await manager.save(
    manager.create(User, {
      name: 'Omar Khaled',
      email: 'manager@warehouse.io',
      password: await bcrypt.hash('Manager@123', 10),
      role: 'MANAGER',
    }),
  );
  await manager.save(
    manager.create(User, {
      name: 'Sara Mostafa',
      email: 'picker@warehouse.io',
      password: await bcrypt.hash('Picker@123', 10),
      role: 'PICKER',
    }),
  );

  const locations: Location[] = [];
  for (const item of locationsSeed) {
    locations.push(await manager.save(manager.create(Location, item)));
  }

  const products: Product[] = [];
  for (const item of productsSeed) {
    products.push(await manager.save(manager.create(Product, item)));
  }

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const productQuantities = INITIAL_STOCK[index] || [0];
    for (let locationIndex = 0; locationIndex < productQuantities.length; locationIndex += 1) {
      const quantity = productQuantities[locationIndex];
      if (!quantity) continue;
      const location = locations[locationIndex];
      await manager.save(
        manager.create(Inventory, {
          productId: product.id,
          locationId: location.id,
          quantityOnHand: quantity,
          quantityReserved: 0,
        }),
      );
      await manager.save(
        manager.create(StockMovement, {
          productId: product.id,
          locationId: location.id,
          type: 'RECEIPT',
          quantity,
          reference: 'INITIAL-STOCK',
          notes: 'Opening stock loaded during system setup',
          userId: admin.id,
        }),
      );
    }
  }

  const receiving = await manager.save(
    manager.create(ReceivingOrder, {
      orderNumber: 'RCV-INITIAL-001',
      supplier: 'Nile Packaging Supplies',
      status: 'PENDING',
      expectedDate: new Date(Date.now() + 2 * 86_400_000),
      notes: 'Weekly packaging restock',
    }),
  );
  await manager.save([
    manager.create(ReceivingItem, { orderId: receiving.id, productId: products[3].id, quantityExpected: 100 }),
    manager.create(ReceivingItem, { orderId: receiving.id, productId: products[5].id, quantityExpected: 50 }),
  ]);

  const picking = await manager.save(
    manager.create(PickOrder, {
      orderNumber: 'PICK-INITIAL-001',
      reference: 'SO-10482',
      status: 'ASSIGNED',
      priority: 'HIGH',
      assigneeId: managerUser.id,
      notes: 'Priority customer order',
    }),
  );
  await manager.save([
    manager.create(PickItem, { orderId: picking.id, productId: products[0].id, quantityOrdered: 5 }),
    manager.create(PickItem, { orderId: picking.id, productId: products[6].id, quantityOrdered: 20 }),
  ]);

  const shipment = await manager.save(
    manager.create(Shipment, {
      shipmentNumber: 'SHP-INITIAL-001',
      carrier: 'Fast Line Logistics',
      trackingNumber: 'FL-889210',
      destination: 'Alexandria Distribution Center',
      status: 'PENDING',
    }),
  );
  await manager.save([
    manager.create(ShipmentItem, { shipmentId: shipment.id, productId: products[1].id, quantity: 3 }),
  ]);
}

async function seed() {
  const options = getDatabaseOptions() as any;
  // Honour DB_SYNCHRONIZE. In production (false) the schema must already exist;
  // for a brand-new database bootstrap once with DB_SYNCHRONIZE=true explicitly.
  const dataSource = new DataSource({ ...options, entities, synchronize: options.synchronize === true });
  await dataSource.initialize();

  try {
    // Reliable skip guard: the seed always creates this exact admin account.
    const existing = await dataSource.getRepository(User).findOne({
      where: { email: 'admin@warehouse.io' },
    });
    if (existing) {
      console.log('Seed skipped: database is already initialised.');
      return;
    }

    await dataSource.transaction(seedRow);
    console.log('Seed complete: 3 users, 7 locations, 12 products, stock and sample orders created.');
    console.log('Demo credentials are documented in README.md - change them before production use.');
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
