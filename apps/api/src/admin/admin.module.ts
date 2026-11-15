import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
