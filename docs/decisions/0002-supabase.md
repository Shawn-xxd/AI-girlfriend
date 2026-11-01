# ADR 0002：统一采用 Supabase

状态：用户已批准，替代初始 PRD 中“不使用 Supabase”的限制。

## 决策

Supabase 提供 Auth（包括 Sign in with Apple）、PostgreSQL 与私有 Storage，替代 Clerk、Neon、R2。Railway 继续运行 NestJS，Prisma 继续管理业务表；Expo、RevenueCat、OpenAI、Next.js 保持不变。

目标是减少独立维护的平台数量，不承诺费用更低。不增加 Edge Functions、Realtime 或第二套钱包业务实现。

## 当前落实

- 更新架构、项目规则、环境模板和后续验收计划。
- User 新增前向迁移：Clerk 身份字段改为唯一 Supabase 用户 UUID；保留原始迁移历史。
- 业务表启用 RLS，无客户端访问策略。NestJS 用服务端连接访问并承担资源归属校验。
- Phase 1 继续使用普通本地 PostgreSQL 验证核心后端；它不包含 Supabase Auth/Storage，不可作为登录或存储集成成功的证明。
- 没有生产数据迁移；如发现真实 Clerk 用户，先做身份映射，不能把非 UUID 身份直接转换。

## 后续

创建独立 Supabase 开发项目后配置数据库连接。Phase 2 集成官方 JS SDK、iOS 会话安全存储、Apple 登录与 API token 验证；Phase 3 集成私有 Storage。只在实现对应能力时安装依赖。

风险：独立环境与备份功能取决于套餐；图片流量费用需持续观察；服务端 secret key 绕过部分访问限制，必须严格保密。商业上线前验证 Auth/业务用户同步、账号删除、RLS、图片授权与备份恢复。
