#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null || { echo '请安装 Node.js 24 LTS。'; exit 1; }
project_dir=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_dir"
if [ ! -f .env ]; then
  set +x
  set +v
  trap 'unset LOCAL_API_KEY' EXIT
  printf '请输入 Supabase 服务端 Secret key（隐藏输入），按回车：'
  IFS= read -r -s LOCAL_API_KEY
  printf '\n'
  node scripts/configure-local.cjs 3<<<"$LOCAL_API_KEY"
  unset LOCAL_API_KEY
else
  echo '保留已有 .env；当前后端需要 SUPABASE_URL 和 SUPABASE_SECRET_KEY。'
fi
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 check
echo '工程检查完成。请确认正式 SQL 迁移已在开发库执行，再按 README 启动 API。'
