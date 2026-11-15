import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { adminRoleSchema } from '../packages/shared/src/admin';
const config = z
  .object({
    SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
    ADMIN_USER_ID: z.uuid(),
    ADMIN_ROLE: adminRoleSchema,
  })
  .safeParse(process.env);
async function main() {
  if (!config.success)
    throw new Error(
      '请通过安全环境变量提供 SUPABASE_URL、SUPABASE_SECRET_KEY、ADMIN_USER_ID 和 ADMIN_ROLE',
    );
  const env = config.data;
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const existing = await client.auth.admin.getUserById(env.ADMIN_USER_ID);
  const user = existing.data?.user;
  if (existing.error || !user || user.is_anonymous || !user.email_confirmed_at)
    throw new Error('目标必须为已验证邮箱的非匿名管理员账号');
  const update = await client.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      companion_admin_role: env.ADMIN_ROLE,
    },
  });
  if (update.error) throw new Error('管理员授权失败');
  const verify = await client.auth.admin.getUserById(user.id);
  if (
    verify.error ||
    verify.data.user.app_metadata.companion_admin_role !== env.ADMIN_ROLE
  )
    throw new Error('管理员权限回读未通过');
  console.log(
    JSON.stringify({ administratorConfigured: true, role: env.ADMIN_ROLE }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : '管理员授权失败');
  process.exitCode = 1;
});
