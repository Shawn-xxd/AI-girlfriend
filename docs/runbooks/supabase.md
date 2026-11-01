# Supabase 配置（最新入口）

当前正式后端已采用 SDK，经 HTTPS 使用 SUPABASE_URL / SUPABASE_SECRET_KEY。请以 sdk-development.md 和 supabase/migrations 为准。旧 TCP/CA/Prisma 配置不再是应用运行前提。

本页原步骤已由 ADR 0004 替代。SDK 的真实读写/事务探针已通过；正式业务表迁移、HTTP 集成、Apple 登录及真实 AI 聊天按阶段分别验证。
