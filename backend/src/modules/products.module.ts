import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterError } from 'multer';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { mkdir, open, unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { join, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import { DataSource, IsNull, Repository, TableColumn } from 'typeorm';
import { Roles } from '../common/decorators';
import { CreateProductDto, UpdateProductDto } from '../common/dto';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from '../config/upload.config';
import {
  Inventory,
  PickItem,
  Product,
  ReceivingItem,
  ShipmentItem,
  StockMovement,
} from '../database/entities';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const barcodeFor = (id: number) => `WMS${String(id).padStart(10, '0')}`;

const imageStorage = diskStorage({
  destination: (_request, _file, callback) => {
    mkdir(UPLOAD_DIR, { recursive: true })
      .then(() => callback(null, UPLOAD_DIR))
      .catch((error) => callback(error, UPLOAD_DIR));
  },
  filename: (_request, file, callback) => {
    // The file filter guarantees the mimetype is one of IMAGE_EXTENSIONS.
    callback(null, `${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`);
  },
});

const imageFileFilter = (
  _request: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, accept: boolean) => void,
) => {
  if (!IMAGE_EXTENSIONS[file.mimetype]) {
    callback(new BadRequestException('Only JPEG, PNG, WebP and GIF images are allowed'), false);
    return;
  }
  callback(null, true);
};

// Client-declared mimetypes can be spoofed, so confirm the bytes match a real image.
const MAGIC_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'image/gif': (b) =>
    b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)),
};

async function readFileHeader(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Production runs with synchronize disabled, so add the media columns if an
   * existing database predates them. Idempotent and dialect-agnostic.
   */
  private async ensureMediaColumns(): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const table = await runner.getTable('products');
      if (!table) return; // A fresh schema is created by synchronize/seed.
      const expected = [
        new TableColumn({ name: 'barcode', type: 'varchar', length: '40', isNullable: true, isUnique: true }),
        new TableColumn({ name: 'imagePath', type: 'varchar', length: '255', isNullable: true }),
      ];
      const missing = expected.filter((column) => !table.columns.some((c) => c.name === column.name));
      if (missing.length === 0) return;
      await runner.startTransaction();
      for (const column of missing) {
        await runner.addColumn('products', column);
      }
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      // Self-healing: log a clear message but do not block API startup.
      console.error('Could not ensure product media columns:', error);
    } finally {
      await runner.release();
    }
  }

  /** Backfill barcodes for products created before the barcode field existed. */
  async onModuleInit() {
    await this.ensureMediaColumns();
    const missing = await this.productsRepository.find({ where: { barcode: IsNull() } });
    await this.productsRepository.manager.transaction(async (manager) => {
      for (const product of missing) {
        product.barcode = barcodeFor(product.id);
        await manager.save(product);
      }
    });
  }

  async findAll(params: { search?: string; category?: string; lowStock?: string }) {
    const query = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .orderBy('product.id', 'ASC');

    if (params.search) {
      query.andWhere('(LOWER(product.name) LIKE :search OR LOWER(product.sku) LIKE :search)', {
        search: `%${params.search.toLowerCase()}%`,
      });
    }
    if (params.category) {
      query.andWhere('product.category = :category', { category: params.category });
    }

    const products = await query.getMany();
    if (params.lowStock === 'true') {
      return products.filter((product) => {
        const onHand = product.inventory.reduce((sum, item) => sum + item.quantityOnHand, 0);
        return onHand <= product.reorderLevel;
      });
    }
    return products;
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['inventory', 'inventory.location'],
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async categories(): Promise<string[]> {
    const rows = await this.productsRepository
      .createQueryBuilder('product')
      .select('DISTINCT product.category', 'category')
      .where('product.category IS NOT NULL')
      .orderBy('product.category', 'ASC')
      .getRawMany<{ category: string }>();
    return rows.map((row) => row.category);
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const existing = await this.productsRepository.findOne({ where: { sku: dto.sku } });
    if (existing) {
      throw new BadRequestException('A product with this SKU already exists');
    }
    return this.productsRepository.manager.transaction(async (manager) => {
      const product = manager.create(Product, dto);
      const saved = await manager.save(product);
      saved.barcode = barcodeFor(saved.id);
      return manager.save(saved);
    });
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.productsRepository.findOne({ where: { sku: dto.sku } });
      if (existing) {
        throw new BadRequestException('A product with this SKU already exists');
      }
    }
    Object.assign(product, dto);
    return this.productsRepository.save(product);
  }

  private async deleteImageFile(imagePath: string | null) {
    if (!imagePath?.startsWith(`${UPLOAD_URL_PREFIX}/`)) return;
    const filename = imagePath.slice(UPLOAD_URL_PREFIX.length + 1);
    const target = resolve(UPLOAD_DIR, filename);
    if (!target.startsWith(UPLOAD_DIR + sep)) return;
    await unlink(target).catch(() => undefined);
  }

  async setImage(id: number, imagePath: string | null): Promise<string | null> {
    const product = await this.findOne(id);
    const previous = product.imagePath;
    product.imagePath = imagePath;
    await this.productsRepository.save(product);
    if (previous !== imagePath) await this.deleteImageFile(previous);
    return product.imagePath;
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    // Never destroy stock or audit history: require deactivation instead.
    const manager = this.productsRepository.manager;
    const [inventory, movements, receiving, picking, shipping] = await Promise.all([
      manager.count(Inventory, { where: { productId: id } }),
      manager.count(StockMovement, { where: { productId: id } }),
      manager.count(ReceivingItem, { where: { productId: id } }),
      manager.count(PickItem, { where: { productId: id } }),
      manager.count(ShipmentItem, { where: { productId: id } }),
    ]);
    if (inventory + movements + receiving + picking + shipping > 0) {
      throw new BadRequestException(
        'This product has stock or transaction history. Deactivate it instead of deleting it.',
      );
    }
    await this.productsRepository.remove(product);
    await this.deleteImageFile(product.imagePath);
  }
}

/** Map multer's size/parse errors to proper HTTP responses instead of a 500. */
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = error.code === 'LIMIT_FILE_SIZE' ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
    response.status(status).json({ statusCode: status, message: error.message });
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: { search?: string; category?: string; lowStock?: string }) {
    return this.productsService.findAll(query);
  }

  @Get('categories')
  categories() {
    return this.productsService.categories();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Post(':id/image')
  @Roles('ADMIN', 'MANAGER')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: imageStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('An image file is required');
    const storedPath = join(UPLOAD_DIR, file.filename);
    try {
      // Multer stored the file before validation; confirm the bytes really are an image.
      const header = await readFileHeader(storedPath);
      if (!MAGIC_SIGNATURES[file.mimetype]?.(header)) {
        throw new BadRequestException('File contents do not match the declared image type');
      }
      await this.productsService.findOne(id); // 404 must also clean up the stored file.
      const imagePath = `${UPLOAD_URL_PREFIX}/${file.filename}`;
      return { imagePath: await this.productsService.setImage(id, imagePath) };
    } catch (error) {
      await unlink(storedPath).catch(() => undefined);
      throw error;
    }
  }

  @Delete(':id/image')
  @Roles('ADMIN', 'MANAGER')
  async removeImage(@Param('id', ParseIntPipe) id: number) {
    return { imagePath: await this.productsService.setImage(id, null) };
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
