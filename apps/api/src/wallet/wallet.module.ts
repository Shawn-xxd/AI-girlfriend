import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
