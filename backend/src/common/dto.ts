import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Single upper bound for all quantity-bearing requests (prevents absurd values). */
export const MAX_QUANTITY = 1_000_000;

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsIn(['ADMIN', 'MANAGER', 'PICKER'])
  role: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MANAGER', 'PICKER'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** PATCH may update any subset of fields; validate only the ones supplied. */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  warehouse: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  aisle?: string;

  @IsOptional()
  @IsString()
  rack?: string;

  @IsOptional()
  @IsString()
  bin?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** PATCH may update any subset of fields; validate only the ones supplied. */
export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  warehouse?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  aisle?: string;

  @IsOptional()
  @IsString()
  rack?: string;

  @IsOptional()
  @IsString()
  bin?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdjustInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId: number;

  /* Signed only for ADJUSTMENT; all other types require a positive magnitude. */
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_QUANTITY)
  @Max(MAX_QUANTITY)
  quantity: number;

  @IsIn(['RECEIPT', 'PICK', 'SHIPMENT', 'ADJUSTMENT', 'RETURN'])
  type: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceivingItemDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantityExpected: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateReceivingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  supplier: string;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivingItemDto)
  items: ReceivingItemDto[];
}

export class UpdateReceivingNotesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes: string;
}

export class ReceiveLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityReceived: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;
}

export class ReceiveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  items: ReceiveLineDto[];
}

export class PickItemDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;
}

export class CreatePickDto {
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickItemDto)
  items: PickItemDto[];
}

export class AssignPickDto {
  @Type(() => Number)
  @IsInt()
  assigneeId: number;
}

export class CompletePickLineDto {
  @Type(() => Number)
  @IsInt()
  itemId: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityPicked: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;
}

export class CompletePickDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletePickLineDto)
  items: CompletePickLineDto[];
}

export class ShipmentItemDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity: number;
}

export class CreateShipmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  carrier: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemDto)
  items: ShipmentItemDto[];
}

export class InventoryFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: string;
}

export class MovementFiltersDto {
  @IsOptional()
  @IsIn(['RECEIPT', 'PICK', 'SHIPMENT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
