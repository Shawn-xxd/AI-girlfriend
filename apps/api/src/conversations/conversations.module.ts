import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
@Module({
  imports: [AuthModule, AiModule, DatabaseModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
