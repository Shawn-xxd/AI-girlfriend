# AI Companion

面向成年人的非露骨 AI 陪伴 iOS 产品。用户全程免注册、免登录，不显示登录状态。已完成主要参考界面、真实 Supabase 匿名身份、DeepSeek 回复、消息存储与历史恢复；真实浏览器闭环通过。原生 iPhone 验收、等级照片、支付和运营后台仍待交付。

[查看首版 12 屏引导预览](docs/previews/onboarding-overview.png)

## 当前技术方案

Expo Router + NestJS + Supabase Auth/PostgreSQL/Storage。正式数据库访问采用官方 Supabase SDK，经 HTTPS 调用 Data API；原 Prisma 依赖已移除，历史文件仅保留在 docs/archive/prisma。复杂原子操作通过 PostgreSQL RPC。Railway 后续运行后端，GitHub 保存代码，EAS 发布 iOS App。

SDK 对真实 Supabase 的读写、跨两表回滚和并发探针已通过；当前开发项目的三份正式迁移也已执行并核对校验和。

## 初始化

Node.js 24 LTS（推荐 24.22.2），pnpm 11.25.0。

```bash
pnpm install --frozen-lockfile
```

复制 .env.example 为 .env（已有则保留），安全配置 SUPABASE*URL、SUPABASE_SECRET_KEY。密钥仅在服务端，不能放入 apps/mobile/.env 或 EXPO_PUBLIC*\*。云环境已注入的变量优先，不需要重复提供。

新环境需要在 Supabase 开发项目 SQL Editor 按 manifest.ts 顺序执行 supabase/migrations 下的 SQL；当前开发项目已应用基础、聊天与分阶段用量三份迁移，无需重跑。这些文件是正式迁移来源，记录版本和内容校验和，可以重复执行；不通过应用接口执行任意 SQL，也不依赖实验表。

## 启动

分别在两个终端运行：

```bash
pnpm dev:api
pnpm dev:mobile
```

内部验证：

```bash
curl --fail http://127.0.0.1:3000/v1/health/live
curl --fail http://127.0.0.1:3000/v1/health/ready
```

ready 会实际读取正式迁移版本及校验和，缺少迁移返回 503。移动端默认显示首次引导；连接检查页移至 `/development`。真机的公开 API 地址需要使用可达的局域网或 HTTPS 地址；本云环境不提供用户预览链接。

## 当前 API

- GET /v1/health/live：进程存活。
- GET /v1/health/ready：真实数据库迁移状态，敏感错误不返回客户端。
- GET /v1/me：需要 Supabase access token，幂等创建并返回当前业务用户；身份来自服务端验证。
- GET /v1/characters：需要 access token，只返回已发布角色的公开字段，最多 50 条。
- POST/GET /v1/conversations：创建或查询本人会话。
- GET /v1/conversations/:id：本人的会话和公开角色资料。
- GET /v1/conversations/:id/messages：消息分页与状态。
- POST /v1/conversations/:id/messages：以 UUID 请求键发送、重试，服务端真实生成并持久化。
- POST /v1/conversations/:id/messages/stream：真实供应商流，输出审核并存储后通过 SSE 交付结果。

Authorization 为 Bearer access-token。服务端 Secret key 不是普通用户 token，不能用它绕过接口认证。会话/消息接口与可替换模型适配器见 [聊天开发说明](docs/runbooks/chat-development.md)。按用户最新决定不加入登录 UI，采用后台真实游客身份；公开密钥和后台匿名开关已就绪，真实匿名闭环通过。真实 DeepSeek 单轮审核、生成、持久化和结果重放已通过，原生 iPhone 闭环尚未验收。引导、游客和配置详见 [移动端开发说明](docs/runbooks/onboarding-development.md)。

## 检查

```bash
pnpm check
# 可选：在隔离 Docker 数据库中检查迁移/重复执行/权限
 docker compose up -d --wait
pnpm test:schema
# 正式迁移已在开发 Supabase 执行后，运行真实 API 集成测试
pnpm test:integration
# 仅在实际模型配置就绪时运行一次；正常路径含三个可能计费的模型调用
pnpm test:ai-live
```

真实集成测试会创建无邮件发送的临时身份和角色，验证认证、用户隔离、角色发布状态，最后清理。仅允许当前指定开发项目，不在生产运行。CI 默认执行工程检查和隔离 SQL 测试；真实 Supabase 测试使用手动 workflow 和 development secrets。

## 文档

- docs/decisions/0004-supabase-sdk.md：最新架构决定。
- docs/runbooks/sdk-development.md：迁移、运行和部署说明。
- docs/architecture/phases.md：阶段与验收。
- docs/experiments/supabase-sdk：独立的已通过探针，不是正式业务迁移。

旧 Mac/Prisma 说明仅作历史记录，以最新 ADR 和本 README 为准。源码通过本 GitHub 仓库管理；Railway 尚未部署，iOS 原生/真机流程尚未验证。环境变量只在安全配置中填写，不随仓库同步。

最新模型选择见 [提供商配置](docs/runbooks/model-providers.md)：当前默认 DeepSeek，模型 ID 可配置；OpenAI 不再是必选依赖服务。

Discover 的预览与正式模式边界、角色/游客配置及验收范围见 [Discover 开发说明](docs/runbooks/discover-development.md)。

[查看 Discover 参考图版预览](docs/previews/discover.png)

[查看聊天页预览](docs/previews/chat.png) · [查看 Chats 预览](docs/previews/chats.png)

匹配过渡与独立双列相册见 [开发验收](docs/runbooks/match-gallery.md)：Heart → Match → CHAT NOW → 聊天，相册返回保留输入。

[查看匹配页](docs/previews/match.png) · [查看相册页](docs/previews/gallery.png)

2026-11-08 最新结果：102 项本地测试、真实匿名/DeepSeek 验收及真实浏览器引导→匹配→聊天→历史恢复通过；已加入六个明确开发角色。详见 [真实游客验收](docs/runbooks/guest-acceptance.md)。后端镜像和 Railway 配置已验证准备，尚未对外发布，见 [部署说明](docs/runbooks/railway-deployment.md)。
