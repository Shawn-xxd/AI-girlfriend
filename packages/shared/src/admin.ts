import { z } from 'zod';
export const adminRoleSchema = z.enum(['viewer', 'editor', 'admin']);
export type AdminRole = z.infer<typeof adminRoleSchema>;
const revision = z.number().int().nonnegative().nullable();
const objectKey = z
  .string()
  .max(512)
  .regex(/^admin\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)
  .nullable();
export const adminCharacterInput = z
  .object({
    id: z.uuid(),
    revision,
    name: z.string().trim().min(1).max(64),
    archetype: z.string().trim().min(1).max(64),
    bio: z.string().max(2000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    system_prompt: z.string().max(8000),
    cover_object_key: objectKey,
    published: z.boolean(),
  })
  .strict()
  .refine((x) => !x.published || x.system_prompt.trim().length > 0, {
    message: '发布角色前请填写人设提示词',
  });
export const adminPhotoInput = z
  .object({
    id: z.uuid(),
    revision,
    character_id: z.uuid(),
    title: z.string().trim().min(1).max(64),
    kind: z.enum(['level', 'diamond']),
    required_level: z.number().int().min(1).max(1000).nullable(),
    diamond_price: z.number().int().min(1).max(1000000000).nullable(),
    object_key: objectKey.unwrap(),
    review_status: z.enum(['draft', 'approved', 'rejected']),
    published: z.boolean(),
  })
  .strict()
  .refine(
    (x) =>
      x.kind === 'level'
        ? x.required_level !== null && x.diamond_price === null
        : x.required_level === null,
    { message: '等级照片需要等级；钻石照片不能配置等级' },
  )
  .refine(
    (x) =>
      !x.published ||
      (x.review_status === 'approved' &&
        (x.kind !== 'diamond' || x.diamond_price !== null)),
    { message: '发布前须审核通过并配置价格' },
  );
export const adminLevelsInput = z
  .object({
    character_id: z.uuid(),
    revision,
    rules: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(1000),
            requiredCount: z.number().int().min(0).max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict()
  .refine(
    (x) =>
      x.rules.every(
        (r, i) =>
          r.level === i + 1 &&
          (i === 0
            ? r.requiredCount === 0
            : r.requiredCount > x.rules[i - 1]!.requiredCount),
      ),
    { message: '等级须从 1 连续递增，初始门槛为 0，后续门槛严格递增' },
  );
export const adminUploadInput = z
  .object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) })
  .strict();
export type AdminCharacterInput = z.infer<typeof adminCharacterInput>;
export type AdminPhotoInput = z.infer<typeof adminPhotoInput>;
export type AdminLevelsInput = z.infer<typeof adminLevelsInput>;
export type AdminCharacter = Omit<AdminCharacterInput, 'revision'> & {
  revision: number;
  created_at: string;
  coverUrl?: string;
};
export type AdminPhoto = Omit<AdminPhotoInput, 'revision'> & {
  revision: number;
  created_at: string;
};
export type AdminLevels = Omit<AdminLevelsInput, 'revision'> & {
  revision: number;
};
export type AdminAudit = {
  id: string;
  actor_id: string;
  action: string;
  target_id: string;
  created_at: string;
  before_data: unknown;
  after_data: unknown;
};
