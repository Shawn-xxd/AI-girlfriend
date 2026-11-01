# Supabase SDK HTTPS 验证（已完成）

> 正式后端现已替换 Prisma，正式业务迁移和真实 HTTP 集成也已通过；见 ADR 0004、README.md 与 phase2-backend-results.md。以下是最初独立实验记录。

目的：在当前 Codex 云环境使用官方 `@supabase/supabase-js@2.118.0`，对真实开发 Supabase 完成读写、数据库唯一约束、跨两表事务提交/回滚和并发递增。Node 24 通过 NODE_USE_ENV_PROXY=1 使用平台 HTTPS 代理及原有 CA 信任。

## 所需外部配置

1. 在 Supabase 开发项目的 Project Settings → API Keys 找到服务端 Secret key（新版通常 `sb_secret_` 开头；旧版 service_role 亦为服务端密钥）。不要使用 publishable/anon key 做此服务端实验，不要发密钥到聊天。
2. 在 Codex 环境设置为 SUPABASE_SECRET_KEY 安全填入该密钥，保存并发布/应用后检查变量 ready。需求名称已保存到草稿，没有保存密钥值。
3. 在开发项目的 SQL Editor 执行本目录 prepare.sql。SQL 只创建 companion_sdk_probe_runs、companion_sdk_probe_events 和一个实验 RPC，不更改现有 User/auth/storage/钱包表。普通用户和匿名访问被拒绝；仅服务端角色可操作。

项目入口：https://supabase.com/dashboard/project/dxpiqttvtxjhmlvxstbb

## 执行

在 /workspace/AI-girlfriend：

```bash
pnpm typecheck:supabase-sdk
pnpm verify:supabase-sdk
```

缺密钥的退出码为 2，不是通过或测试跳过成功。每次使用随机 UUID，只清理本次行和关联流水。程序异常退出或插入响应丢失可能留下一条无业务意义的测试数据；不会据此修改业务数据。RPC 是 SECURITY INVOKER，受限 search_path，默认不授予 PUBLIC/anon/authenticated 执行权。

SDK 验证会故意制造重复主键和一次 RPC 失败，要求分别返回 23505 和 P0001，并读取数据库确认回滚；八次并发递增后应为 9，流水也应有 9 条且 delta 均为 1。成功后清理运行行并校验关联流水消失。

完成后可在 SQL Editor 执行 cleanup.sql 删除实验资源。它们不属于 Prisma 正式业务迁移；不要把实验脚本当作最终迁移管理方案。

## 当前证据

- Node 原生 fetch 经 HTTPS 代理请求 Supabase /rest/v1 返回 401：已证明传输可达，尚未证明认证或数据读写。
- SDK 实验脚本的 lint/类型检查通过。
- prepare.sql 已在隔离 PostgreSQL 中验证服务端权限、两表事务回滚、拒绝普通角色授权、级联清理；所有实验对象和角色改动最终回滚。
- 2026-11-01：用户在 Supabase 执行 prepare.sql，当前云环境的 SUPABASE_SECRET_KEY 绑定 ready。
- 在当前云环境运行 `pnpm verify:supabase-sdk`，退出码 0。对真实 Supabase 的 SDK 读写、重复主键拒绝、两表 RPC 提交及故意失败回滚、8 次并发递增与流水一致性全部通过。
- 本次随机 UUID 对应的运行行和关联流水已删除，并查询确认清理。实验表/函数仍保留，可用 cleanup.sql 移除。
- 上述结果不等于 NestJS 已切换 SDK、用户权限已验证或生产支付已验收。

## 范围限制

成功也仅说明当前服务端 SDK 路线可行。正式替换 Prisma 前还要设计唯一的 SQL 迁移来源、普通用户资源归属权限、支付幂等/退款、生产并发和故障测试。不能使用 SDK 多次独立 HTTP 请求冒充一个数据库事务；复杂原子操作需要服务端数据库函数。实验完成后，NestJS 已切换 SDK；本目录仍只保存实验资源。
