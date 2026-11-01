import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.pathname === '/' || url.pathname === '') &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)))
      );
    }),
  SUPABASE_SECRET_KEY: z.string().min(1),
  AI_PROVIDER: z
    .enum(['deepseek', 'openai', 'openai-compatible'])
    .default('deepseek'),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER_API_KEY: z.string().min(1).optional(), // Legacy OpenAI-only key.
  AI_COMPATIBLE_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    })
    .optional(),
  MODERATION_PROVIDER: z.enum(['deepseek', 'openai']).default('deepseek'),
  MODERATION_API_KEY: z.string().min(1).optional(),
  MODERATION_MODEL: z.string().min(1).max(160).optional(),
  AI_MODEL: z.string().min(1).max(160).optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(512),
  AI_CONTEXT_TURNS: z.coerce.number().int().min(1).max(20).default(10),
});
export function parseConfig(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  return result.data;
}

export type ServerConfig = ReturnType<typeof parseConfig>;
