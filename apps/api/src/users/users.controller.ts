import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { UsersService } from './users.service';
@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get()
  current(@Req() request: AuthenticatedRequest) {
    return this.users.current(request.authUserId);
  }
}
