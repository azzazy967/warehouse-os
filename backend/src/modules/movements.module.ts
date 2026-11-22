import {
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MovementFiltersDto } from '../common/dto';
import { Product, StockMovement } from '../database/entities';

/** Expands a date-only value to a UTC day boundary; keeps full ISO timestamps intact. */
function dayBoundary(value: string, endOfDay: boolean): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
}

@Injectable()
export class MovementsService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movementsRepository: Repository<StockMovement>,
  ) {}

  async findAll(filters: MovementFiltersDto) {
    const query = this.movementsRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('movement.location', 'location')
      .leftJoinAndSelect('movement.user', 'user')
      .orderBy('movement.createdAt', 'DESC')
      .take(500);

    if (filters.type) query.andWhere('movement.type = :type', { type: filters.type });
    if (filters.productId) {
      query.andWhere('movement.productId = :productId', { productId: filters.productId });
    }
    if (filters.from) {
      query.andWhere('movement.createdAt >= :from', { from: dayBoundary(filters.from, false) });
    }
    if (filters.to) {
      query.andWhere('movement.createdAt <= :to', { to: dayBoundary(filters.to, true) });
    }
    if (filters.search) {
      query.andWhere(
        '(LOWER(product.name) LIKE :search OR LOWER(product.sku) LIKE :search OR LOWER(movement.reference) LIKE :search)',
        { search: `%${filters.search.toLowerCase()}%` },
      );
    }
    return query.getMany();
  }

  async findByProduct(productId: number) {
    return this.movementsRepository.find({
      where: { productId },
      relations: ['location', 'user', 'product'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async typeCounts() {
    return this.movementsRepository
      .createQueryBuilder('movement')
      .select('movement.type', 'type')
      .addSelect('COUNT(movement.id)', 'count')
      .groupBy('movement.type')
      .getRawMany<{ type: string; count: string }>();
  }
}

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  findAll(@Query() query: MovementFiltersDto) {
    return this.movementsService.findAll(query);
  }

  @Get('product/:productId')
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.movementsService.findByProduct(productId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([StockMovement, Product])],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService],
})
export class MovementsModule {}
