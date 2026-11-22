import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { Public, CurrentUser, AuthenticatedUser } from '../common/decorators';
import { LoginRateLimitGuard } from '../common/guards';
import { LoginDto } from '../common/dto';
import { User } from '../database/entities';
import { UsersModule, UsersService } from './users.module';

/** Valid bcrypt hash used to keep failed logins constant-time. */
const DUMMY_PASSWORD_HASH = '$2a$10$uvgM5XD5jKSDzx7ky/WcNuhvyeZ1vGoY/iehzqfsZdphSDSgAXboC';
const PLACEHOLDER_SECRETS = new Set(['change-this-secret', 'replace-with-a-long-random-secret']);

export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be configured and at least 16 characters long');
  }
  if (
    config.get<string>('NODE_ENV') === 'production' &&
    (PLACEHOLDER_SECRETS.has(secret) || secret.startsWith('dev-only'))
  ) {
    throw new Error('JWT_SECRET is a placeholder value; set a strong production secret');
  }
  return secret;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      // Equalise timing between "no such user" and "wrong password" paths.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return null;
    }
    const matches = await bcrypt.compare(password, user.password);
    return matches ? user : null;
  }

  async login(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: { sub: number }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or no longer exists');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    } as AuthenticatedUser;
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.authService.login(user);
  }

  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser) {
    const user = await this.usersService.findById(current.id);
    const { password, ...safe } = user;
    return safe;
  }
}

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') || '8h',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
