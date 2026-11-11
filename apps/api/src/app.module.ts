import { WalletModule } from './wallet/wallet.module';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CharactersModule } from './characters/characters.module';
@Module({
  imports: [
    WalletModule,
    DatabaseModule,
    UsersModule,
    CharactersModule,
    ConversationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
