# 正式 SDK 后端开发

## 云端环境

需要 SUPABASE_URL 和服务端 SUPABASE_SECRET_KEY。保持继承的代理和 CA 信任，Node 的启动/测试命令设置 NODE_USE_ENV_PROXY=1。Secret key 仅用于 NestJS，不放入共享包或移动端。当前目标是独立开发 Supabase 项目。

## 唯一的正式 SQL 来源

supabase/migrations 存储有序 SQL 版本，manifest.ts 记录迁移主体校验和。pnpm db:validate 验证主体内容与 ledger 声明，不能替代 SQL 执行。已应用版本不可修改，变化新增版本。旧 Prisma 文件归档，不再执行。

在 Supabase SQL Editor 执行同一份迁移文件。当前正式文件创建 companion_users、companion_characters、companion_schema_migrations，不触碰 auth/storage、历史 User 或实验表。所有表 RLS 开启，无普通用户直接读写授权。角色默认未发布，未填入任意正式人物或图片。

运行角色仅可读取迁移 ledger；写入由迁移执行者完成。迁移使用数据库事务和 advisory lock，重复执行相同版本不会重复写 ledger，主体校验和不同则报错。应用 readiness 要求最新版本和校验和一致。

暂未接入授权的管理 API/MCP，当前云任务也不能直接执行 PostgreSQL DDL。因此真实云库应用迁移需要用户通过 SQL Editor 完成，这不代表需要回到 Mac 开发。未来部署使用支持的受控迁移渠道，并执行同一份 SQL，不创建第二个 schema 管理入口。

## 当前模块

DatabaseModule 封装 SDK、请求超时和 readiness。
AuthModule 使用 Supabase getUser 校验 access token，不仅 decode JWT；失效 token 返回 401，上游不可用返回 503。
UsersModule 根据验证后的身份幂等映射业务用户，忽略客户端自报用户 ID。
CharactersModule 只查询 published=true 并显式选择可公开字段。

当前健康检查验证业务 schema；不依赖 companion*sdk_probe*\* 实验资源。服务端 SDK 绕过 RLS 的能力意味着每个业务接口仍要校验用户归属，后续消息、钱包等不得复用无作用域的任意查询接口。

## 验证

pnpm check：SQL artifact 校验、lint、格式、类型、单元测试、配置测试、API 编译。
pnpm test:schema：隔离 Docker PostgreSQL 中两次迁移、唯一用户、约束、RLS 和角色授权。
pnpm test:integration：真实 Supabase 及 NestJS HTTP，要求正式迁移已执行；创建临时 Auth 身份和角色，不发送邮件，清理后退出。不是 Apple 原生登录验证，也不验证完整生产支付。

普通 CI 不需要服务端云密钥。手动 Development Supabase integration workflow 需要 GitHub development 环境中的 DEV_SUPABASE_URL/DEV_SUPABASE_SECRET_KEY，不使用生产密钥。

## 后续配置

Apple 登录需要移动端公开 publishable key、Apple provider、Bundle ID/EAS 开发构建。OpenAI 聊天需要安全配置服务端 API Key、模型与预算，并允许官方 API 域名。这些能力未实现或未验证时，不能对外宣称完整 Phase 2 闭环完成。

## Railway

构建：pnpm install --frozen-lockfile && pnpm build:api。
启动：pnpm --filter @companion/api start。
变量：SUPABASE_URL、SUPABASE_SECRET_KEY 和平台 PORT，分别配置开发/测试/生产。
迁移先在受控发布步骤执行；应用启动不自动 DDL。readiness 为 /v1/health/ready，部署后必须实际检查数据库和认证路径。尚未部署 Railway，不提供虚构 URL。
