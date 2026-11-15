import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { adminRoleSchema, type AdminRole } from '@companion/shared';
import { DatabaseService } from '../database.service';
export interface AdminRequest {
  admin: { id: string; role: AdminRole };
  headers: Record<string, unknown>;
}
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const token =
      typeof req.headers.authorization === 'string'
        ? /^Bearer ([^\s]+)$/.exec(req.headers.authorization)?.[1]
        : undefined;
    if (!token)
      throw new UnauthorizedException('Admin authentication required');
    let result;
    try {
      result = await this.database.client.auth.getUser(token);
    } catch {
      throw new ServiceUnavailableException('Admin authentication unavailable');
    }
    if (result.error) {
      if (
        !result.error.status ||
        result.error.status >= 500 ||
        result.error.status === 429
      )
        throw new ServiceUnavailableException(
          'Admin authentication unavailable',
        );
      throw new UnauthorizedException('Invalid admin session');
    }
    const user = result.data.user;
    if (!user) throw new UnauthorizedException('Invalid admin session');
    const role = adminRoleSchema.safeParse(
      user.app_metadata?.companion_admin_role,
    );
    if (user.is_anonymous || !user.email_confirmed_at || !role.success)
      throw new ForbiddenException('Administrator access required');
    req.admin = { id: user.id, role: role.data };
    return true;
  }
}
export function requireEditor(actor: AdminRequest['admin']) {
  if (actor.role === 'viewer')
    throw new ForbiddenException('Read-only administrator');
}
export function requirePublisher(actor: AdminRequest['admin']) {
  if (actor.role !== 'admin')
    throw new ForbiddenException('Publishing requires administrator approval');
}
