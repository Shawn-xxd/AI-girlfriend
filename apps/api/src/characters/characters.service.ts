import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { signedCharacterCover } from './cover';
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
      .select('id,name,archetype,bio,tags,cover_object_key')
      .eq('published', true)
      .order('id')
      .limit(50);
    const characters = await Promise.all(
      (data ?? []).map(async (row) => {
        const { cover_object_key, ...character } = row;
        return {
          ...character,
          ...(cover_object_key
            ? {
                coverUrl: await signedCharacterCover(
                  this.database,
                  cover_object_key,
                ),
              }
            : {}),
        };
      }),
    );
    const parsed = characterListSchema.safeParse({ characters });
    if (error || !parsed.success)
      throw new ServiceUnavailableException('Characters unavailable');
    return parsed.data;
  }
}
