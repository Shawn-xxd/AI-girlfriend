import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@companion/shared';
import { DatabaseService } from './database.service';
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  @Get('live')
  live(): HealthResponse {
    return healthResponseSchema.parse({ status: 'ok' });
  }
  @Get('ready')
  async ready(): Promise<HealthResponse> {
    try {
      await this.database.checkReadiness();
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return healthResponseSchema.parse({ status: 'ok' });
  }
}
