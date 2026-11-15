import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AdminCharacterInput,
  AdminPhotoInput,
  AdminLevelsInput,
} from '@companion/shared';
import { DatabaseService } from '../database.service';
import {
  requireEditor,
  requirePublisher,
  type AdminRequest,
} from './admin.guard';
import { photoBucket } from '../conversations/level-photos.service';
type Actor = AdminRequest['admin'];
function fail(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === 'PT409')
    throw new ConflictException('内容已被修改，请重新加载后编辑');
  if (error.code === 'P0002') throw new NotFoundException('内容不存在');
  if (
    error.code === 'PT400' ||
    error.code === '23514' ||
    error.code === '23505'
  )
    throw new BadRequestException(
      '配置无效，或已获授权的照片不允许替换，请检查后重试',
    );
  throw new ServiceUnavailableException('后台数据暂时不可用');
}
@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async characters(before?: string) {
    const r = await this.database.client
      .from('companion_characters')
      .select('*')
      .order('id', { ascending: false })
      .limit(51)
      .lt('id', before ?? 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    fail(r.error);
    const rows = r.data ?? [];
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async photos(character: string) {
    const r = await this.database.client
      .from('companion_photos')
      .select('*')
      .eq('character_id', character)
      .order('created_at', { ascending: false })
      .limit(200);
    fail(r.error);
    return { items: r.data ?? [] };
  }
  async levels(character: string) {
    const r = await this.database.client
      .from('companion_level_configs')
      .select('*')
      .eq('character_id', character)
      .maybeSingle();
    fail(r.error);
    return (
      r.data ?? {
        character_id: character,
        revision: null,
        rules: [{ level: 1, requiredCount: 0 }],
      }
    );
  }
  async audit(before?: string) {
    const r = await this.database.client
      .from('companion_admin_audit')
      .select('*')
      .order('id', { ascending: false })
      .limit(51)
      .lt('id', before ?? '9223372036854775807');
    fail(r.error);
    const rows = r.data ?? [];
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? String(rows[49]!.id) : null,
    };
  }
  private async write(
    actor: Actor,
    action: string,
    target: string,
    payload: object,
    revision: number | null,
  ) {
    const r = await this.database.client.rpc('companion_admin_write_v1', {
      p_actor: actor.id,
      p_role: actor.role,
      p_action: action,
      p_target: target,
      p_payload: payload as Record<string, never>,
      p_revision: revision,
    });
    fail(r.error);
    return r.data;
  }
  async saveCharacter(actor: Actor, input: AdminCharacterInput) {
    requireEditor(actor);
    if (input.published) requirePublisher(actor);
    if (input.cover_object_key)
      await this.validateAsset(input.cover_object_key);
    return this.write(actor, 'character.save', input.id, input, input.revision);
  }
  async savePhoto(actor: Actor, input: AdminPhotoInput) {
    requireEditor(actor);
    if (input.published || input.review_status === 'approved')
      requirePublisher(actor);
    await this.validateAsset(input.object_key);
    return this.write(actor, 'photo.save', input.id, input, input.revision);
  }
  async saveLevels(actor: Actor, input: AdminLevelsInput) {
    requirePublisher(actor);
    return this.write(
      actor,
      'levels.save',
      input.character_id,
      input,
      input.revision,
    );
  }
  private async privateBucket() {
    const r = await this.database.client.storage.getBucket(photoBucket);
    if (r.error || !r.data || r.data.public)
      throw new ServiceUnavailableException('需要私有照片存储桶');
  }
  async upload(actor: Actor, type: 'image/jpeg' | 'image/png' | 'image/webp') {
    requireEditor(actor);
    await this.privateBucket();
    const ext = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }[type];
    const path = `admin/${actor.id}/${randomUUID()}.${ext}`;
    const r = await this.database.client.storage
      .from(photoBucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (r.error || !r.data)
      throw new ServiceUnavailableException('无法创建上传授权');
    return { path, token: r.data.token, bucket: photoBucket };
  }
  private async validateAsset(path: string) {
    await this.privateBucket();
    const r = await this.database.client.storage.from(photoBucket).info(path);
    if (r.error || !r.data)
      throw new BadRequestException('素材不存在，请先上传');
    const metadata = r.data.metadata as {
      size?: number;
      mimetype?: string;
    } | null;
    if (
      !metadata ||
      !metadata.size ||
      metadata.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        metadata.mimetype ?? '',
      )
    )
      throw new BadRequestException('素材须为 8 MB 以内的 JPEG、PNG 或 WebP');
    // Verify bytes instead of trusting client MIME labels. SVG/HTML are never accepted.
    const blob = await this.database.client.storage
      .from(photoBucket)
      .download(path);
    if (blob.error || !blob.data) throw new BadRequestException('无法读取素材');
    const bytes = Buffer.from(await blob.data.arrayBuffer());
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP';
    const valid = path.endsWith('.png')
      ? png
      : path.endsWith('.jpg')
        ? jpeg
        : webp;
    if (!valid) throw new BadRequestException('素材类型与文件内容不一致');
  }
  async preview(path: string) {
    await this.privateBucket();
    const r = await this.database.client.storage
      .from(photoBucket)
      .createSignedUrl(path, 300);
    if (r.error || !r.data) throw new NotFoundException('素材不存在');
    return { url: r.data.signedUrl, expiresIn: 300 };
  }
}
