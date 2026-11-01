# 可选 Mac 本地开发

当前主流程可在 Codex 云端继续，正式后端通过 Supabase SDK HTTPS 工作。Mac 是可选执行环境，不是数据库接入前提。旧 PostgreSQL URI/CA/Prisma 操作已退出当前流程。

Node 24 LTS、pnpm 11.25。首次可运行 bash scripts/setup-local.sh，隐藏输入服务端 Secret key；它保护已有 .env，安装依赖并运行工程检查。正式 SQL 仍按 docs/runbooks/sdk-development.md 在开发 Supabase 执行。

两个终端运行 pnpm dev:api 与 pnpm dev:mobile；没有全局 pnpm 时用 npx --yes pnpm@11.25.0 调用。真机需要可达的 API URL，Xcode/EAS/Apple 登录在对应阶段配置。

GitHub 保存源代码，不同步 .env。当前云聊天不会自动修改 Mac 文件；本地继续开发需打开本地项目任务。Railway 后续部署 NestJS，EAS 发布 iOS App。
