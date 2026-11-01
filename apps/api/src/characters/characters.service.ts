import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { characterListSchema, type CharacterList } from '@companion/shared';
@Injectable()
export class CharactersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async list(): Promise<CharacterList> {
    const { data, error } = await this.database.client
      .from('companion_characters')
      .select('id,name,archetype,bio,tags')
      .eq('published', true)
      .order('id')
      .limit(50);
    const parsed = characterListSchema.safeParse({ characters: data });
    if (error || !parsed.success)
      throw new ServiceUnavailableException('Characters unavailable');
    return parsed.data;
  }
}
