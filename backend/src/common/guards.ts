import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { UserRole } from '../database/entities';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: any, info: any): TUser {
    if (err || !user) {
      throw new UnauthorizedException(info?.message || 'Invalid or expired token');
    }
    return user as TUser;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;
    if (!user || !roles.includes(user.role as UserRole)) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return true;
  }
}

interface AttemptWindow {
  count: number;
  resetAt: number;
}

/**
 * Lightweight per-IP sliding-window limiter for the login route.
 * Keeps brute-force attempts bounded without an external store; a multi-instance
 * deployment should replace this with a shared rate limiter (Redis).
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private static readonly MAX_ATTEMPTS = 10;
  private static readonly WINDOW_MS = 60_000;

  private readonly attempts = new Map<string, AttemptWindow>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; socket?: { remoteAddress?: string } }>();
    const key = request.ip || request.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current || now >= current.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + LoginRateLimitGuard.WINDOW_MS });
      return true;
    }

    current.count += 1;
    if (current.count > LoginRateLimitGuard.MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many sign-in attempts. Please try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
