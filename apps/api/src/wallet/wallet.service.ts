import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { photoUnlockResponseSchema, walletSchema } from '@companion/shared';
import { DatabaseService } from '../database.service';
export function walletResult<T>(
  schema: z.ZodType<T>,
  result: { data: unknown; error: { code: string } | null },
): T {
  if (result.error) {
    const code = result.error.code;
    if (code === 'P0002') throw new NotFoundException('Photo unavailable');
    if (code === 'PT402') throw new HttpException('Not enough diamonds', 402);
    if (code === 'PT409' || code === '23505')
      throw new HttpException('Please refresh the photo price', 409);
    if (code === 'PT400')
      throw new HttpException('Invalid wallet request', 400);
    throw new ServiceUnavailableException('Wallet unavailable');
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success)
    throw new ServiceUnavailableException('Wallet unavailable');
  return parsed.data;
}
@Injectable()
export class WalletService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async snapshot(actor: string) {
    return walletResult(
      walletSchema,
      await this.database.client.rpc('companion_wallet_snapshot_v1', {
        p_actor: actor,
      }),
    );
  }
  async unlock(
    actor: string,
    conversation: string,
    photo: string,
    body: { requestKey: string; expectedPrice: number },
  ) {
    return walletResult(
      photoUnlockResponseSchema,
      await this.database.client.rpc('companion_unlock_diamond_photo_v1', {
        p_actor: actor,
        p_conversation: conversation,
        p_photo: photo,
        p_key: body.requestKey,
        p_expected_price: body.expectedPrice,
      }),
    );
  }
}
