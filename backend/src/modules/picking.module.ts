import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/decorators';
import { AssignPickDto, CompletePickDto, CreatePickDto } from '../common/dto';
import { generateNumber } from '../common/helpers';
import {
  OrderStatuses,
  PickItem,
  PickOrder,
  Priorities,
  User,
} from '../database/entities';
import { InventoryModule, InventoryService } from './inventory.module';

@Injectable()
export class PickingService {
  constructor(
    @InjectRepository(PickOrder)
    private readonly ordersRepository: Repository<PickOrder>,
    @InjectRepository(PickItem)
    private readonly itemsRepository: Repository<PickItem>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filters?: { status?: string }) {
    const where: any = filters?.status ? { status: filters.status } : {};
    return this.ordersRepository.find({
      where,
      relations: ['items', 'items.product', 'items.location', 'assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findMy(userId: number) {
    return this.ordersRepository.find({
      where: { assigneeId: userId },
      relations: ['items', 'items.product', 'items.location', 'assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PickOrder> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'items.location', 'assignee'],
    });
    if (!order) {
      throw new NotFoundException(`Pick order ${id} not found`);
    }
    return order;
  }

  async create(dto: CreatePickDto) {
    const order = this.ordersRepository.create({
      orderNumber: generateNumber('PICK'),
      reference: dto.reference || null,
      priority: (dto.priority || Priorities.NORMAL) as PickOrder['priority'],
      status: OrderStatuses.PENDING,
      notes: dto.notes || null,
      items: dto.items.map((item) =>
        this.itemsRepository.create({
          productId: item.productId,
          locationId: item.locationId ?? null,
          quantityOrdered: item.quantity,
          quantityPicked: 0,
        }),
      ),
    });
    return this.ordersRepository.save(order);
  }

  async assign(id: number, assigneeId: number) {
    const assignee = await this.usersRepository.findOne({
      where: { id: assigneeId, isActive: true },
    });
    if (!assignee) {
      throw new BadRequestException('The selected user is not an active assignee');
    }
    const order = await this.findOne(id);
    if (order.status === OrderStatuses.COMPLETED || order.status === OrderStatuses.CANCELLED) {
      throw new BadRequestException(`Pick order is ${order.status.toLowerCase()}`);
    }
    order.assigneeId = assignee.id;
    order.status = OrderStatuses.ASSIGNED;
    await this.ordersRepository.save(order);
    // Re-read so the response includes the freshly persisted assignee relation.
    return this.findOne(id);
  }

  async complete(id: number, dto: CompletePickDto, user: AuthenticatedUser) {
    await this.dataSource.transaction(async (manager) => {
      // Atomic claim: only one caller may move a live order to PROCESSING.
      const claimed = await manager
        .createQueryBuilder()
        .update(PickOrder)
        .set({ status: OrderStatuses.PROCESSING })
        .where('id = :id AND status IN (:...live)', {
          id,
          live: [OrderStatuses.PENDING, OrderStatuses.ASSIGNED],
        })
        .execute();
      if (claimed.affected !== 1) {
        const existing = await manager.findOne(PickOrder, { where: { id } });
        if (!existing) throw new NotFoundException(`Pick order ${id} not found`);
        throw new BadRequestException(`Pick order is ${existing.status.toLowerCase()}`);
      }

      const order = await manager.findOne(PickOrder, {
        where: { id },
        relations: ['items'],
      });
      if (!order) throw new NotFoundException(`Pick order ${id} not found`);
      if (user.role === 'PICKER' && order.assigneeId !== user.id) {
        throw new ForbiddenException('You can only complete pick orders assigned to you');
      }

      const requested = new Map(dto.items.map((line) => [line.itemId, line]));
      if (requested.size !== dto.items.length) {
        throw new BadRequestException('Duplicate pick line');
      }
      const validIds = new Set(order.items.map((item) => item.id));
      for (const line of dto.items) {
        if (!validIds.has(line.itemId)) {
          throw new BadRequestException(`Line ${line.itemId} does not belong to this order`);
        }
      }

      for (const item of order.items) {
        const line = requested.get(item.id);
        if (!line || line.quantityPicked <= 0) continue;

        let deductions: Array<{ locationId: number; quantity: number }>;
        if (line.locationId || item.locationId) {
          deductions = [
            { locationId: line.locationId || item.locationId, quantity: line.quantityPicked },
          ];
        } else {
          deductions = await this.inventoryService.deductAcrossLocations(
            manager,
            item.productId,
            line.quantityPicked,
          );
        }

        for (const deduction of deductions) {
          await this.inventoryService.applyMovement(manager, {
            productId: item.productId,
            locationId: deduction.locationId,
            quantityDelta: -deduction.quantity,
            type: 'PICK',
            reference: order.orderNumber,
            notes: `Picked for ${order.reference || order.orderNumber}`,
            userId: user.id,
          });
        }
        // Accumulate instead of overwrite so partial picks are additive.
        item.quantityPicked += line.quantityPicked;
        if (item.quantityPicked > item.quantityOrdered) {
          throw new BadRequestException('Cannot pick more than the ordered quantity');
        }
        item.locationId = deductions[0]?.locationId ?? item.locationId;
        await manager.save(item);
      }

      const fullyPicked = order.items.every(
        (item) => item.quantityPicked >= item.quantityOrdered,
      );
      order.status = fullyPicked ? OrderStatuses.COMPLETED : OrderStatuses.ASSIGNED;
      if (fullyPicked) order.pickedAt = new Date();
      await manager.save(order);
    });

    // Re-read after commit so the caller sees updated quantities and status.
    return this.findOne(id);
  }

  async cancel(id: number) {
    const result = await this.ordersRepository
      .createQueryBuilder()
      .update(PickOrder)
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
          ? 'A completed pick order cannot be cancelled'
          : `Pick order is ${existing.status.toLowerCase()}`,
      );
    }
    return this.findOne(id);
  }
}

@Controller('picking')
export class PickingController {
  constructor(private readonly pickingService: PickingService) {}

  @Get()
  findAll(@Query() query: { status?: string }) {
    return this.pickingService.findAll(query);
  }

  @Get('my')
  my(@CurrentUser() user: AuthenticatedUser) {
    return this.pickingService.findMy(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pickingService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreatePickDto) {
    return this.pickingService.create(dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER')
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPickDto) {
    return this.pickingService.assign(id, dto.assigneeId);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'PICKER')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompletePickDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.complete(id, dto, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.pickingService.cancel(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([PickOrder, PickItem, User]), InventoryModule],
  controllers: [PickingController],
  providers: [PickingService],
  exports: [PickingService],
})
export class PickingModule {}
