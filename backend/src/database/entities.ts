import { Exclude, Transform } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import * as dotenv from 'dotenv';
import { decimal } from '../common/helpers';

// TypeORM's better-sqlite3 driver accepts "datetime" but not "timestamp",
// while Postgres accepts "timestamp" but not "datetime". Resolve per driver.
dotenv.config();
const DATETIME_TYPE: 'timestamp' | 'datetime' =
  process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';

export const UserRoles = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  PICKER: 'PICKER',
} as const;
export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

export const MovementTypes = {
  RECEIPT: 'RECEIPT',
  PICK: 'PICK',
  SHIPMENT: 'SHIPMENT',
  TRANSFER: 'TRANSFER',
  ADJUSTMENT: 'ADJUSTMENT',
  RETURN: 'RETURN',
} as const;
export type MovementType = (typeof MovementTypes)[keyof typeof MovementTypes];

export const OrderStatuses = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  // Transient in-transaction claim that fences concurrent completions.
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatuses)[keyof typeof OrderStatuses];

export const Priorities = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priorities)[keyof typeof Priorities];

export const ShipmentStatuses = {
  PENDING: 'PENDING',
  // Transient in-transaction claim that fences concurrent shipments.
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type ShipmentStatus = (typeof ShipmentStatuses)[keyof typeof ShipmentStatuses];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index('IDX_users_email', { unique: true })
  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'varchar', length: 20, default: UserRoles.PICKER })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_products_sku', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  sku: string;

  @Index('IDX_products_barcode', { unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  barcode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imagePath: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 30, default: 'EA' })
  unitOfMeasure: string;

  @Column({ type: 'int', default: 0 })
  reorderLevel: number;

  @Transform(({ value }) => decimal(value))
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unitCost: number;

  @Transform(({ value }) => decimal(value))
  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  weight: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Inventory, (inventory) => inventory.product)
  inventory: Inventory[];
}

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_locations_code', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  warehouse: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  zone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aisle: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rack: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bin: string | null;

  @Column({ type: 'varchar', length: 40, default: 'BIN' })
  type: string;

  @Column({ type: 'int', default: 0 })
  capacity: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Inventory, (inventory) => inventory.location)
  inventory: Inventory[];
}

@Entity('inventory')
@Index('IDX_inventory_product_location', ['productId', 'locationId'], { unique: true })
export class Inventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ type: 'int' })
  locationId: number;

  @ManyToOne(() => Product, (product) => product.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Location, (location) => location.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column({ type: 'int', default: 0 })
  quantityOnHand: number;

  @Column({ type: 'int', default: 0 })
  quantityReserved: number;

  @UpdateDateColumn()
  updatedAt: Date;

  get available(): number {
    return this.quantityOnHand - this.quantityReserved;
  }
}

@Entity('stock_movements')
@Index('IDX_movements_created', ['createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ type: 'int' })
  locationId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column({ type: 'varchar', length: 20 })
  type: MovementType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('receiving_orders')
export class ReceivingOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_receiving_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  orderNumber: string;

  @Column({ type: 'varchar', length: 180 })
  supplier: string;

  @Column({ type: 'varchar', length: 20, default: OrderStatuses.PENDING })
  status: OrderStatus;

  @Column({ type: DATETIME_TYPE, nullable: true })
  expectedDate: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', nullable: true })
  receivedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivedById' })
  receivedBy: User | null;

  @Column({ type: DATETIME_TYPE, nullable: true })
  receivedAt: Date | null;

  @OneToMany(() => ReceivingItem, (item) => item.order, { cascade: true, eager: true })
  items: ReceivingItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('receiving_items')
export class ReceivingItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => ReceivingOrder, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: ReceivingOrder;

  @Column({ type: 'int' })
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int', nullable: true })
  locationId: number | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location | null;

  @Column({ type: 'int' })
  quantityExpected: number;

  @Column({ type: 'int', default: 0 })
  quantityReceived: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}

@Entity('pick_orders')
export class PickOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_pick_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  orderNumber: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 20, default: Priorities.NORMAL })
  priority: Priority;

  @Column({ type: 'varchar', length: 20, default: OrderStatuses.PENDING })
  status: OrderStatus;

  @Column({ type: 'int', nullable: true })
  assigneeId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  assignee: User | null;

  @Column({ type: DATETIME_TYPE, nullable: true })
  pickedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => PickItem, (item) => item.order, { cascade: true, eager: true })
  items: PickItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('pick_items')
export class PickItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => PickOrder, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: PickOrder;

  @Column({ type: 'int' })
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int', nullable: true })
  locationId: number | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location | null;

  @Column({ type: 'int' })
  quantityOrdered: number;

  @Column({ type: 'int', default: 0 })
  quantityPicked: number;
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_shipment_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  shipmentNumber: string;

  @Column({ type: 'varchar', length: 120 })
  carrier: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'varchar', length: 200 })
  destination: string;

  @Column({ type: 'varchar', length: 20, default: ShipmentStatuses.PENDING })
  status: ShipmentStatus;

  @Column({ type: 'int', nullable: true })
  shippedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shippedById' })
  shippedBy: User | null;

  @Column({ type: DATETIME_TYPE, nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => ShipmentItem, (item) => item.shipment, { cascade: true, eager: true })
  items: ShipmentItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('shipment_items')
export class ShipmentItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  shipmentId: number;

  @ManyToOne(() => Shipment, (shipment) => shipment.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'int' })
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  quantityShipped: number;
}

export const entities = [
  User,
  Product,
  Location,
  Inventory,
  StockMovement,
  ReceivingOrder,
  ReceivingItem,
  PickOrder,
  PickItem,
  Shipment,
  ShipmentItem,
];
