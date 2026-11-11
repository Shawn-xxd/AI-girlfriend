import {
  Controller,
  Get,
  Header,
  Inject,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { WalletService } from './wallet.service';
@Controller('wallet')
@UseGuards(SupabaseAuthGuard)
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  snapshot(@Req() request: AuthenticatedRequest) {
    return this.wallet.snapshot(request.authUserId);
  }
}
