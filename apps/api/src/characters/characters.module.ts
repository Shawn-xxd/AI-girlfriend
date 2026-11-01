import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
