import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CharactersService } from './characters.service';
@Controller('characters')
@UseGuards(SupabaseAuthGuard)
export class CharactersController {
  constructor(
    @Inject(CharactersService) private readonly characters: CharactersService,
  ) {}
  @Get()
  list() {
    return this.characters.list();
  }
}
