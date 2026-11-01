# SDK 正式后端基础：当前交付

本页保留基础迁移交付时的历史记录。2026-11-01 后续三份正式迁移与校验和、8 项真实 Supabase 集成及 1 项真实 DeepSeek 单轮验收均已通过，最新状态以 [聊天开发说明](chat-development.md) 为准；下述旧的待配置项不再代表当前阻塞。

## 已实现

- NestJS 正式访问层切为 Supabase SDK，移除 Prisma 依赖和运行命令；历史文件归档。
- 正式版本化 SQL：用户表、角色表、迁移 ledger，RLS、角色权限、主体内容校验和与重复执行检查。
- GET /v1/health/live、/ready；ready 检查正式迁移，不依赖探针表。
- Supabase access token 服务端验证；GET /v1/me 幂等映射当前用户；GET /v1/characters 只返回已发布角色的公开字段。
- 数据库类型限定在服务端；共享包提供 Zod API 契约。
- CI 运行代码检查和隔离 SQL 测试；真实 Supabase 集成有单独手动工作流，不向 PR 注入服务端密钥。

## 实际验证

- pnpm check 通过：10 项 Jest 单元测试、4 项配置测试、lint/格式/类型、迁移 artifact 校验、共享包/API 构建。
- pnpm test:schema 通过：隔离数据库完整执行并重复执行迁移，验证用户幂等、字段约束、默认未发布、RLS 和最小角色权限。
- 编译产物实际启动：live HTTP 200，未认证的 /me 和 /characters HTTP 401。
- 正式迁移执行前 ready HTTP 503，正确阻止就绪声明；用户执行迁移后，真实集成中的 ready HTTP 200。
- 2026-11-01 用户执行正式迁移后，pnpm test:integration 退出码 0，5 项测试全部通过：实际 HTTP readiness、缺少/无效 token 拒绝、两位真实临时用户的身份隔离与幂等映射、已发布角色过滤及字段限制、数据库故障脱敏。
- 临时 Auth 用户与角色使用随机标识创建，无邮件发送；测试清理执行成功。此前的迁移前阻塞已解除，未通过任何跳过断言获得成功。

## 正式迁移状态

用户已在同一开发 Supabase 的 SQL Editor 执行 supabase/migrations/20261101000100_sdk_foundation.sql。它与已通过的实验 prepare.sql 不同，仅创建正式 companion_users/companion_characters/companion_schema_migrations，不修改 auth/storage 或现有 User/探针表。

迁移和真实 API 集成已完成。其他独立环境仍需执行同一版本迁移，再验证就绪状态。

当前没有 Supabase 管理工具或可用 PostgreSQL DDL 通道，服务端 Data API Key 不能代替 SQL Editor 的管理授权。

## 尚未交付

完整 Phase 2 尚未完成：移动端 Apple 登录、会话消息与真实 OpenAI 回复还需继续实现和验收。AI 模型/服务端 Key、移动端 publishable key 与 Apple provider 配置尚未提供，不应宣称完整闭环可用。等级、钱包、支付、运营后台属于后续阶段。

本页基础交付时尚未推送 GitHub；当前源码状态见 README。Railway 尚未部署，没有虚构预览或发布地址。

## 后续聊天开发

会话/消息、幂等 RPC、独立 AI 尝试用量、真实 OpenAI 适配器和内容审核已经实现。当前新版检查结果及外部前置条件见 chat-development.md；本页前述 5 项真实集成结果仅对应基础迁移版本，不代表新聊天端点通过。
