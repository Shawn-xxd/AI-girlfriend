import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { currentUserSchema, type CurrentUser } from '@companion/shared';
@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async current(authUserId: string): Promise<CurrentUser> {
    const { error } = await this.database.client
      .from('companion_users')
      .upsert({ id: authUserId }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new ServiceUnavailableException('User data unavailable');
    const result = await this.database.client
      .from('companion_users')
      .select('id,created_at')
      .eq('id', authUserId)
      .single();
    const parsed = currentUserSchema.safeParse(
      result.data && { id: result.data.id, createdAt: result.data.created_at },
    );
    if (result.error || !parsed.success)
      throw new ServiceUnavailableException('User data unavailable');
    return parsed.data;
  }
}
