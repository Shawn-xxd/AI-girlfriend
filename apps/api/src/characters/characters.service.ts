import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { characterCoverSigner } from './cover';
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
      .select('id,name,archetype,bio,tags,cover_object_key,avatar_focus_y')
      .eq('published', true)
      .order('id')
      .limit(50);
    if (error) throw new ServiceUnavailableException('Characters unavailable');
    const sign = data?.some((row) => row.cover_object_key)
      ? await characterCoverSigner(this.database)
      : undefined;
    const characters = await Promise.all(
      (data ?? []).map(async (row) => {
        const { cover_object_key, avatar_focus_y, ...character } = row;
        return {
          ...character,
          avatarFocusY: avatar_focus_y,
          ...(cover_object_key
            ? {
                coverUrl: await sign!(cover_object_key),
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
