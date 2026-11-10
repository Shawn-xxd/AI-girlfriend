import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  levelGallerySchema,
  photoAccessSchema,
  timelinePageSchema,
} from '@companion/shared';
import { DatabaseService } from '../database.service';

export const photoBucket = 'companion-photos';
const signedPhotoLifetimeSeconds = 60;
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ServiceUnavailableException('Photos unavailable');
  return parsed.data;
}
function checkError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === 'P0002')
    throw new NotFoundException('Conversation unavailable');
  throw new ServiceUnavailableException('Photos unavailable');
}
@Injectable()
export class LevelPhotosService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  private async sync(actor: string, conversation: string) {
    const result = await this.database.client.rpc(
      'companion_sync_progress_v1',
      { p_actor: actor, p_conversation: conversation },
    );
    checkError(result.error);
  }
  async timeline(
    actor: string,
    conversation: string,
    query: { before?: number; limit: number },
  ) {
    await this.sync(actor, conversation);
    const result = await this.database.client.rpc('companion_timeline_v1', {
      p_actor: actor,
      p_conversation: conversation,
      p_before: query.before ?? null,
      p_limit: query.limit,
    });
    checkError(result.error);
    return checked(timelinePageSchema, result.data);
  }
  async gallery(actor: string, conversation: string) {
    await this.sync(actor, conversation);
    const result = await this.database.client.rpc('companion_level_photos_v1', {
      p_actor: actor,
      p_conversation: conversation,
    });
    checkError(result.error);
    return checked(levelGallerySchema, result.data);
  }
  async access(actor: string, conversationId: string, photoId: string) {
    const conversation = await this.database.client
      .from('companion_conversations')
      .select('character_id')
      .eq('id', conversationId)
      .eq('user_id', actor)
      .maybeSingle();
    checkError(conversation.error);
    if (!conversation.data) throw new NotFoundException('Photo unavailable');
    const photo = await this.database.client
      .from('companion_photos')
      .select('id,object_key,review_status')
      .eq('id', photoId)
      .eq('character_id', conversation.data.character_id)
      .eq('kind', 'level')
      .maybeSingle();
    checkError(photo.error);
    if (!photo.data || photo.data.review_status !== 'approved')
      throw new NotFoundException('Photo unavailable');
    const unlock = await this.database.client
      .from('companion_photo_unlocks')
      .select('id')
      .eq('user_id', actor)
      .eq('character_id', conversation.data.character_id)
      .eq('photo_id', photoId)
      .maybeSingle();
    checkError(unlock.error);
    if (!unlock.data) throw new NotFoundException('Photo unavailable');
    const bucket = await this.database.client.storage.getBucket(photoBucket);
    if (bucket.error || !bucket.data || bucket.data.public !== false)
      throw new ServiceUnavailableException('Photos unavailable');
    const expiresAt = new Date(
      Date.now() + signedPhotoLifetimeSeconds * 1000,
    ).toISOString();
    const signed = await this.database.client.storage
      .from(photoBucket)
      .createSignedUrl(photo.data.object_key, signedPhotoLifetimeSeconds);
    if (signed.error || !signed.data?.signedUrl)
      throw new ServiceUnavailableException('Photos unavailable');
    let valid = false;
    try {
      const url = new URL(signed.data.signedUrl);
      valid =
        !url.username &&
        !url.password &&
        !url.hash &&
        url.origin === new URL(process.env.SUPABASE_URL!).origin &&
        url.pathname.startsWith(`/storage/v1/object/sign/${photoBucket}/`);
    } catch {
      /* Reject an unexpected storage response without logging the URL. */
    }
    if (!valid) throw new ServiceUnavailableException('Photos unavailable');
    return checked(photoAccessSchema, {
      url: signed.data.signedUrl,
      expiresAt,
    });
  }
}
