# Codex 云环境数据库网络阻塞：排查与支持请求

> SDK 路线结果：2026-11-01 真实 Supabase HTTPS 读写和两表 RPC 原子性/并发验证已通过。当前无需修复原始 TCP 才能验证数据访问；Prisma 应用层仍未迁移。详见 docs/experiments/supabase-sdk/README.md。

> 更新：已取得 cloud-environment-runtime 的明确网络规则，详见 [官方 MCP 与网络结论](supabase-mcp.md)。executor 无通用 Internet 路由属于设计限制，早期将直接 DNS 失败作为“DNS 服务故障”的判断未获证实。当前 HTTP 白名单不授予数据库 TCP 权限；VPN 未配置、TCP grants 为空，且受支持 TCP 通道仅允许指定私网目标。下文保留早期观察，不应将它们当作已确认的平台故障。

## 已核对

- 数据库主机 aws-0-us-east-1.pooler.supabase.com 已在当前保存的自定义网络白名单内；项目 HTTPS 主机和 Prisma 下载域名也已包含。
- DATABASE_URL / DIRECT_URL 均已注入，目标主机、5432 端口、项目用户名符合 Dashboard 提供的信息；未输出凭证。不能从变量存在推断最新密码正确。
- 当前云环境通过系统解析器查询外部数据库主机返回 EAI_AGAIN；配置的 DNS 服务器 UDP 查询数据库和 github.com 均超时。
- 在命令级 sandbox 外执行的获准只读 DNS/TCP 检查仍失败于 DNS，不是只需批准单条命令即可解决。
- 前次检查：HTTPS 代理可访问 Supabase 项目接口；CONNECT 后标准 PostgreSQL SSLRequest 被关闭，TLS-first 后 PostgreSQL StartupMessage 同样被关闭。代理 TLS 成功不代表源数据库 TLS 已验证。
- 用户在 Mac 使用官方数据库 CA 和新密码，成功完成 TLS、认证和只读查询。云端仍没有对应连接成功的证据。

## 结论边界

目前阻塞在 Codex 运行环境的直接 DNS 和数据库协议网络路径。没有证据表明继续增加 HTTPS 域名、重复发布或重置密码能够解决。现有工具仅能编辑域名 allowlist，不能配置平台 DNS、任意 TCP 规则或查看实时 VPN 状态；无法单方面确认平台是否支持此工作流，也不能宣称所有 Codex 环境都不支持 PostgreSQL。

## 可提交的平台支持请求（不含凭证）

Codex 云环境需要使用 Prisma / PostgreSQL 连接 Supabase Session pooler：aws-0-us-east-1.pooler.supabase.com:5432。该主机已添加到环境白名单并发布，但系统 DNS 返回 EAI_AGAIN，直接查询配置 DNS 的 UDP 请求超时。沙箱外获准的只读检查也失败。HTTPS 代理可达项目 API，但不完成 PostgreSQL 握手。相同项目在 Mac 上使用官方 CA 可认证并执行查询。

请确认此类型云环境是否支持 outbound PostgreSQL TCP/5432 与外部 DNS；若支持，请提供受支持的网络/出口/VPN配置方法，并检查该环境的 DNS/出口；若只支持 HTTP(S)，请明确说明。请勿要求用户发送数据库密码。

## 下一步

1. 获取平台对 DNS/非 HTTP 出站能力的确认，按其支持的设置修复并重测。
2. 用户的 prod-ca-2021.crt 尚未导入项目配置（公开 CA，可上传；私钥不可上传）。网络恢复后，云端运行和迁移都应使用官方 CA 与主机名校验。现有无 TLS 参数的连接串不能作为生产 TLS 配置验收。
3. 在修复后的同一云端运行只读认证检查、Prisma deploy、重复 deploy、集成测试和 API readiness 后，才宣布 Supabase 云接入完成。

没有修改 DNS、关闭证书校验、使用第三方公共转发或改变产品技术栈。配置检查不等于问题已修复。

## 进一步排查：DNS 与代理协议

- 网卡、路由与 resolver 在同一有效子网，未发现指向旧网段的明显残留；到 resolver 的路由可达本地接口。
- resolver 与 HTTP(S)\_PROXY 的 proxy 主机解析为同一地址。UDP DNS 查询超时，TCP DNS 连接明确返回 ECONNREFUSED。没有证据证明是缺少 resolv.conf 文件或应用读取了错误环境变量。
- 未设置把 Supabase 排除在代理外的 NO_PROXY 项；HTTP_PROXY/HTTPS_PROXY 大小写变量均存在。
- 经现有代理对 pooler 的 443 和 5432 发无凭证 HTTPS 探测，均得到 envoy HTTP 404；对项目 Auth 接口得到 HTTP 401。未观察到显式白名单拒绝，但这些响应不能证明数据库 TCP 或 PostgreSQL 协议可用。
- 原始 PostgreSQL SSLRequest / StartupMessage 的连接关闭，加上上述 HTTP 响应，表明现有测试路径不能承载数据库会话。并不能单凭这些结果断言平台所有环境均不支持 PostgreSQL。
- 当前配置工具只提供域名网络规则，没有 resolver、TCP 端口出站、SOCKS 或原始 CONNECT 转发的设置字段。配置草稿不是实时网络状态；也没有实时 VPN/status 工具。

当前需用户或平台确认：环境面板网络/高级部分是否提供受支持的数据库网络或 VPN 出口配置。如果只有 HTTP(S) 域名放行，需要平台检查 DNS 服务和非 HTTP 出站能力；继续改密码、扩大全域名白名单或反复发布没有诊断依据。

尚未修改全局 resolver、路由或证书信任，没有尝试以公共隧道或未知代理转发数据库凭证。官方数据库 CA 的云端配置仍是网络恢复后独立需要完成的验收项。

## 用户环境面板核对

用户提供的完整面板显示：互联网访问已启用，域名策略为包管理器预设加三个自定义域名，DATABASE_URL/DIRECT_URL 均存在；高级部分有 OIDC 与平台管理的 Tailscale（未配置）。没有显示 DNS 或原始 TCP 出站开关。

未添加网络代理密钥不是数据库认证缺失：当前使用的是直接环境变量中的 PostgreSQL 凭证。公网 Supabase 不天然要求 Tailscale；仅看到 VPN 入口不足以证明它支持此场景，也不能判定未配置 VPN 就是根因。若继续调查该入口，应先检查其配置说明是否支持需要的 TCP 路由或出口；不要在云容器自行安装 VPN 客户端。

## 官方文档核对状态

已读取 Supabase 官方仓库的 apps/docs/content/guides/database/connecting-to-postgres.mdx：长驻 IPv4 后端可用 Session pooler，端口 5432；需配置 SSL 并验证 CA 和主机名。当前选择符合 Supabase 官方说明。

OpenAI Codex cloud/internet-access 官方页面及 .md 版本被本机代理以 HTTP 403 拦截；沙箱外文档请求亦失败。官方 openai/codex 仓库 docs/sandbox.md 仅引向 developers.openai.com/codex/security，没有直接给出云端 PostgreSQL 支持声明。不能据此宣称官方已确认支持或不支持数据库 TCP。

为查阅权威文档，将 developers.openai.com 添加到配置草稿的自定义域名列表，保留所有已有域名。需用户保存并应用/发布后再尝试读取；该变更仅解决文档访问，不代表数据库协议连接已修复。
