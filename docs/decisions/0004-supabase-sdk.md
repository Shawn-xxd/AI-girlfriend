# ADR 0004：正式使用 Supabase SDK 和版本化 SQL

状态：用户已授权开始开发；真实 SDK HTTPS 读写、两表原子回滚与并发探针均已通过。

## 决策

NestJS 保留模块化单体，数据库访问采用官方 @supabase/supabase-js，通过 HTTPS Data API/RPC。Prisma 不再作为正式访问层或迁移来源。Expo、Supabase Auth/Storage、PostgreSQL、Railway 和 RevenueCat 保留。

正式表结构统一位于 supabase/migrations，按版本和内容校验和记录。云任务暂未接入 Supabase 管理工具，也没有 PostgreSQL 公网直连，因此迁移通过 Supabase SQL Editor 执行仓库中的同一份 SQL。后续部署可用官方 CLI 执行相同迁移，不创建第二份 schema；应用启动只检查版本，不自动执行 DDL。

旧 Prisma 文件归档，仅用于追溯；不重置或删除任何已有云数据库表。SDK 探针与正式迁移分离，不把探针表当作正式后端依赖。

## 当前交付边界

先完成正式数据库接入、健康检查、Supabase access token 校验、当前用户映射和已发布角色查询。随后推进会话/真实 OpenAI 聊天；不提前实现等级、钱包、支付或整个后台。

权限：移动端不持有 Secret key；服务端验证 Supabase access token 后，只以校验所得身份访问用户数据。业务表启用 RLS，anon/authenticated 无直接表读写权。服务端角色可访问，因此每个 API 必须另外校验用户归属。管理员和普通用户权限将在相应模块独立实现。

复杂原子操作采用受限执行权限的 PostgreSQL 函数，经 SDK RPC 调用。多次独立 HTTP 请求不是一个事务。

## 验收

- 迁移内容校验、SQL 执行和重复执行，以及角色权限验证。
- 类型检查、构建、配置校验、认证拒绝/上游错误分类。
- 实际 NestJS HTTP 就绪请求必须读取正式数据库迁移状态。
- API 与真实 Supabase 用户、角色表进行集成验证；缺少迁移或外部配置时明确阻塞，不能用测试替身替代最终验证。
- iOS Apple 登录和 OpenAI 真实调用依赖对应配置，在接入时单独验收。
