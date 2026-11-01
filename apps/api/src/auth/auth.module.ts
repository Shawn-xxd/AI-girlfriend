import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { SupabaseAuthGuard } from './auth.guard';
@Module({
  imports: [DatabaseModule],
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
