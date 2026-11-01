# Phase 1 当前验证结果

> 最新正式后端结果：SDK 正式访问层、版本化业务 SQL 和 5 项真实 Supabase API 集成已通过。见 phase2-backend-results.md；以下部分保留早期 Prisma 和网络排查历史，不能作为当前待办列表。

> 最新进展：2026-11-01，在本 Codex 云环境中使用 Supabase 官方 SDK 经 HTTPS，真实读写、两表事务提交/回滚、并发一致性与清理均通过（命令退出码 0）。见 docs/experiments/supabase-sdk/README.md。原 Prisma TCP 限制仍存在；NestJS 正式业务层尚未切换，历史 Mac 回退方案不再是本次验证的必要条件。

## 已通过

- 发布后 DATABASE_URL 与 DIRECT_URL 均已注入；仅检查存在性和预期主机，未输出凭证。
- Prisma 官方引擎下载、Client 生成、Schema validate 通过，原 HTTP 403 阻塞解除。
- pnpm check：lint、格式、全部类型检查、5 项基础测试、共享包与 API 构建通过。
- 本地 PostgreSQL：两项迁移成功，第二次执行无待执行迁移。
- 本地数据库集成测试：3 项通过（HTTP 就绪、唯一约束/事务回滚、存储失败返回 503）。
- 编译产物启动成功；实际请求 /v1/health/live 与 /v1/health/ready 均返回 status=ok。
- 集成测试配置采用 Jest ESM 模式以兼容 NestJS 12；未绕过断言。
- 前次 Web/iOS bundle 导出、SQL RLS 默认拒绝检查通过；不等于原生/真机测试。

## Supabase 云连接阻塞

当前机器对 aws-0-us-east-1.pooler.supabase.com 的 DNS 解析返回 EAI_AGAIN。数据库连接未进入密码认证阶段，没有向 Supabase 执行迁移。项目 HTTPS Auth health 请求经环境代理返回 401，说明 HTTPS 路由可达，但不证明 PostgreSQL TCP 可达。

不要重复索取密码或关闭 TLS。需要支持 PostgreSQL TCP/5432 的运行网络和 DNS；HTTPS 域名 allowlist 不足以证明数据库协议受支持。可在后续 Railway 部署或具备直连能力的开发环境验证。当前 API 验证使用显式本地开发连接，未覆盖已注入的云配置。

## 未完成

- Supabase 云数据库连接及迁移；Auth/Storage 集成。
- iOS 真机/EAS、Apple 登录、AI 和支付。
- 本基础阶段验收时未部署 Railway、未推送代码或运行远端 GitHub Actions；当前源码状态见 README。

本地 Phase 1 后端流程已验证，云端 Supabase 接入仍未验收。

## 网络专项排查

- 数据库、项目 HTTPS 主机以及 example.com 的直接 DNS 查询均返回 EAI_AGAIN，问题不限于 Supabase。
- 当前机器配置了 HTTP/HTTPS 代理。代理 CONNECT 到数据库端口可建立隧道，但发送标准 PostgreSQL SSLRequest 后连接被关闭，未收到数据库的 TLS 协商响应。
- TLS-first 路径可验证代理路径上的 TLS 证书，但随后 PostgreSQL StartupMessage 也被关闭；TLS 握手成功不代表数据库可达。
- 协议检查没有发送数据库密码。无法据此判断 Supabase 密码或真实数据库证书是否正确。
- 现有可用网络路径中，尚未找到可承载 PostgreSQL 协议的路线。再次发布或重复添加 HTTPS 域名不是已证实的修复。

处理：继续使用明确选择的本地 PostgreSQL 完成开发；保留已注入的 Supabase 配置。后续在支持数据库 TCP 和 DNS 的运行环境（例如 Railway 部署环境）执行只读连接检查，再运行受控开发迁移。无需为此迁移技术栈，也不通过公开代理转发数据库凭证。

## Mac 本地交付准备

用户决定切换 Mac 本地开发。新增 setup-local.sh 和安全配置辅助工具，保留已有文件，密码特殊字符自动编码，数据库运行/迁移均启用 verify-full 和官方 CA。本轮通过 5 项基础测试、4 项配置测试、3 项本地数据库集成测试、lint/格式/类型检查、后端构建与 Prisma validate/migrate。云端测试机器仍为 Node 24.19；项目推荐版本更新为用户已安装的 Node 24.22.2。Mac 初始化及 Supabase 实际迁移尚未执行，不作已通过声明。
