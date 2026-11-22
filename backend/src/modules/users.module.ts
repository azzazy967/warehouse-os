import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/decorators';
import { CreateUserDto, UpdateUserDto } from '../common/dto';
import { User } from '../database/entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { id: 'ASC' } });
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /** Password is select:false on the entity, so re-select it only for login. */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }
    const user = this.usersRepository.create({
      name: dto.name,
      email: dto.email.trim().toLowerCase(),
      password: await bcrypt.hash(dto.password, 10),
      role: dto.role as User['role'],
      isActive: dto.isActive ?? true,
    });
    return this.usersRepository.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    // Prevent lockout: the last active admin cannot be demoted or deactivated.
    if (user.role === 'ADMIN' && user.isActive) {
      const removesAdminStatus =
        (dto.role !== undefined && dto.role !== 'ADMIN') || dto.isActive === false;
      if (removesAdminStatus) {
        const activeAdmins = await this.usersRepository.count({
          where: { role: 'ADMIN', isActive: true },
        });
        if (activeAdmins <= 1) {
          throw new BadRequestException(
            'The last active administrator cannot be demoted or deactivated',
          );
        }
      }
    }
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing) {
        throw new BadRequestException('A user with this email already exists');
      }
      user.email = dto.email.trim().toLowerCase();
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role as User['role'];
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password !== undefined) {
      user.password = await bcrypt.hash(dto.password, 10);
    }
    return this.usersRepository.save(user);
  }

  async remove(id: number, currentUserId: number): Promise<void> {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const user = await this.findById(id);
    if (user.role === 'ADMIN') {
      const activeAdmins = await this.usersRepository.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException('The last active administrator cannot be deleted');
      }
    }
    await this.usersRepository.remove(user);
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(({ password, ...user }) => user);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const { password, ...user } = await this.usersService.findById(id);
    return user;
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() dto: CreateUserDto) {
    const { password, ...user } = await this.usersService.create(dto);
    return user;
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    const { password, ...user } = await this.usersService.update(id, dto);
    return user;
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.usersService.remove(id, current.id);
    return { deleted: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
