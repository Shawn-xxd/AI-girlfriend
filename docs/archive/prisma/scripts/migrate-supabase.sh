#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null || { echo '需要 Node.js 24。'; exit 1; }
project_dir=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_dir"
ca_file="${SUPABASE_DB_CA_FILE:-$HOME/Downloads/prod-ca-2021.crt}"
[ -f "$ca_file" ] || { echo '找不到 CA 证书，请先将 prod-ca-2021.crt 保存到下载文件夹。'; exit 1; }
[ -f node_modules/prisma/build/index.js ] || { echo '请先在项目目录运行 npx --yes pnpm@11.25.0 install --frozen-lockfile'; exit 1; }
task_dir=$(mktemp -d)
trap 'unset DB_MIGRATION_PASSWORD; rm -rf "$task_dir"' EXIT
set +x
set +v
printf '此操作会在开发项目创建业务表并记录迁移，不修改 Supabase auth/storage 表。\n'
printf '请输入数据库原始密码（隐藏输入），按回车：'
IFS= read -r -s DB_MIGRATION_PASSWORD
printf '\n'
[ -n "$DB_MIGRATION_PASSWORD" ] || { echo '密码不能为空。'; exit 1; }
cat > "$task_dir/migrate.cjs" <<'JS'
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const password = readFileSync(3, 'utf8').replace(/\n$/, '');
const encoded = encodeURIComponent(password);
const url = new URL(`postgresql://postgres.dxpiqttvtxjhmlvxstbb:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`);
url.searchParams.set('sslmode', 'verify-full');
url.searchParams.set('sslrootcert', process.argv[2]);
const env = { ...process.env, DIRECT_URL: url.toString(), DATABASE_URL: url.toString() };
const cli = resolve('node_modules/prisma/build/index.js');
for (const args of [['validate'], ['migrate', 'deploy'], ['migrate', 'status']]) {
  const result = spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 120000 });
  const output = ((result.stdout || '') + (result.stderr || '')).split(url.toString()).join('[REDACTED]').split(encoded).join('[REDACTED]').split(password).join('[REDACTED]');
  process.stdout.write(output);
  if (result.error || result.status !== 0) {
    console.error('迁移检查未完成，请仅分享已脱敏的错误信息，不要重复执行 reset。');
    process.exit(1);
  }
}
console.log('通过：Schema 校验、开发数据库迁移及迁移状态检查。');
JS
node "$task_dir/migrate.cjs" "$ca_file" 3<<<"$DB_MIGRATION_PASSWORD"
