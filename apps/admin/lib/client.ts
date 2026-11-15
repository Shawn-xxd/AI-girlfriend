import { createClient } from '@supabase/supabase-js';
const api = process.env.NEXT_PUBLIC_API_URL;
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !api || !key.startsWith('sb_publishable_')) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
export async function request<T>(
  token: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!api) throw new Error('后台连接尚未配置');
  const response = await fetch(`${api}/v1/admin/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('登录已失效，请退出后重新登录');
    if (response.status === 403)
      throw new Error('账号未获授权，或当前操作需要更高权限');
    if (response.status === 404)
      throw new Error('后台服务尚未部署，或内容已不存在');
    if (response.status === 409)
      throw new Error('内容已被修改，请刷新后重新编辑');
    if (response.status === 400) {
      const d = await response.json().catch(() => null);
      throw new Error(
        typeof d?.message === 'string' ? d.message : '请检查填写的内容',
      );
    }
    throw new Error('服务暂时不可用，请稍后重试');
  }
  return response.json() as Promise<T>;
}
