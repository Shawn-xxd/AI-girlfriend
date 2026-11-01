import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
export interface AuthenticatedRequest {
  authUserId: string;
}
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown>; authUserId?: string }>();
    const header = request.headers.authorization;
    const token =
      typeof header === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(header)?.[1]
        : undefined;
    if (!token) throw new UnauthorizedException('Authentication required');
    try {
      const { data, error } = await this.database.client.auth.getUser(token);
      if (
        error &&
        (!error.status || error.status >= 500 || error.status === 429)
      )
        throw new ServiceUnavailableException('Authentication unavailable');
      if (error || !data.user)
        throw new UnauthorizedException('Invalid session');
      request.authUserId = data.user.id;
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException('Authentication unavailable');
    }
  }
}
