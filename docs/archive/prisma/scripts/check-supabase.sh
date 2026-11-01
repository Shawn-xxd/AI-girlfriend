#!/usr/bin/env bash
set -euo pipefail
# Run on a machine with normal database TCP/DNS access. No database writes.
command -v node >/dev/null || { echo '请先安装 Node.js LTS。'; exit 1; }
command -v npm >/dev/null || { echo '请先安装 npm。'; exit 1; }
task_dir=$(mktemp -d)
trap 'unset DB_CHECK_PASSWORD; rm -rf "$task_dir"' EXIT
printf '准备只读连接检查工具…\n'
npm install --prefix "$task_dir" --no-package-lock --ignore-scripts --no-audit --no-fund pg@8.16.3 >/dev/null
# Disable shell tracing before reading credentials, including when invoked with bash -x.
set +x
set +v
printf '请输入 Supabase 数据库密码（输入隐藏；不要输入连接串），然后按回车：'
IFS= read -r -s DB_CHECK_PASSWORD
printf '\n'
if [ -z "$DB_CHECK_PASSWORD" ]; then
  printf '密码不能为空，请重新运行。\n'
  exit 1
fi
cat > "$task_dir/check.cjs" <<'JS'
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
async function main() {
  // Pass raw password separately: pg handles special characters without URI encoding.
  // File descriptor 3 avoids command arguments, exported variables and saved files.
  const password = readFileSync(3, 'utf8').replace(/\n$/, '');
  const ssl = { rejectUnauthorized: true };
  if (process.env.SUPABASE_DB_CA_FILE) ssl.ca = readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8');
  const client = new Client({
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.dxpiqttvtxjhmlvxstbb',
    database: 'postgres',
    password,
    ssl,
    connectionTimeoutMillis: 12000,
    query_timeout: 10000,
  });
  try {
    await client.connect();
    if (!client.connection.stream.encrypted || !client.connection.stream.authorized) throw Object.assign(new Error(), { code: 'TLS_UNVERIFIED' });
    const check = await client.query('SELECT 1 AS ok');
    if (check.rows[0].ok !== 1) throw Object.assign(new Error(), { code: 'QUERY_FAILED' });
    const tables = await client.query("SELECT to_regclass('public.\"User\"') IS NOT NULL AS present");
    console.log('通过：数据库连接、TLS 证书验证、密码认证、只读查询。');
    console.log('业务 User 表：' + (tables.rows[0].present ? '已存在（不代表迁移完整）' : '尚未创建，可在验证后执行迁移'));
    console.log('本次没有写入或修改数据库。');
  } catch (error) {
    const known = {
      EAI_AGAIN: 'DNS 解析失败', ENOTFOUND: '数据库域名未解析',
      ECONNREFUSED: '连接被拒绝', ETIMEDOUT: '连接超时',
      '28P01': '数据库密码或用户名认证失败',
      SELF_SIGNED_CERT_IN_CHAIN: 'TLS CA 信任失败，需要核对官方数据库 CA',
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS 证书链验证失败',
      UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'TLS 证书颁发者验证失败',
      TLS_UNVERIFIED: '未获得通过验证的 TLS 连接',
    };
    console.error('未通过：' + (known[error.code] || '连接或查询失败；请保留错误代码继续排查'));
    console.error('错误代码：' + (/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN'));
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
main().catch(() => { console.error('配置或本地工具检查失败。未输出凭证。'); process.exitCode = 1; });
JS
node "$task_dir/check.cjs" 3<<<"$DB_CHECK_PASSWORD"
