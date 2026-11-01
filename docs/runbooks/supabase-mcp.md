# Supabase 官方 MCP 与云端数据库访问

本页为改用 SDK 前的网络调查记录，不代表当前开发方案。现已依 ADR 0004 使用 Supabase SDK/HTTPS 在云端开发，三份正式迁移与真实 Supabase/DeepSeek 后端验证通过；用户已关联插件，但当前任务仍未获得 Supabase 管理工具。不要据下述历史内容要求转回本地或执行 Prisma。最新状态见 [聊天开发说明](chat-development.md)。

## 已核实的官方 MCP 接入

已读取 Supabase 官方仓库 https://github.com/supabase/mcp 的 README（supabase-community/supabase-mcp 同样提供该说明）。

- 接入文档：https://supabase.com/docs/guides/getting-started/mcp#step-2-configure-your-ai-tool
- 服务器地址：https://mcp.supabase.com/mcp
- 当前项目的 Connect/MCP 入口：https://supabase.com/dashboard/project/dxpiqttvtxjhmlvxstbb?showConnect=true&connectTab=mcp
- 官方说明：客户端通过登录授权连接，选择包含目标项目的 Organization；可用 project_ref 限定项目，用 read_only=true 进行初始只读验证。
- 本项目初始只读配置 URL：https://mcp.supabase.com/mcp?project_ref=dxpiqttvtxjhmlvxstbb&read_only=true

这确认的是官方 MCP 服务，不代表存在一个已验证的 Codex 商店插件安装链接。当前工具目录没有 Supabase 工具，尚未安装/授权/验证此集成。不索取数据库密码或把 Supabase 密钥写入 MCP URL。

## 当前托管云环境网络的确定限制

依据本次提供的 cloud-environment-runtime 技能及 networking.md、vpn.md：

- executor 没有通用 Internet 路由，HTTP/HTTPS 应通过 session sidecar 代理。因此直接 DNS/连接失败不能单独认定为平台 DNS 故障。
- 原始 TCP 的受支持端点为 proxy:8088，独立于 HTTP(S) 的 proxy:8080；需要 VPN 与独立 TCP grant，没有 TLS 拦截或凭证注入。
- 此 TCP 路径当前限制解析后 IPv4 位于指定私网/Tailnet 网段；不能把公网 Supabase pooler 域名加入 HTTP 白名单就认为已获得 PostgreSQL 访问。
- 当前 /etc/codex/network-policy.json：vpn_configured=false；tcp_network_access.domains 与 ip_ranges 均为空。未尝试绕过授权、修改快照或连接未获授权的 8088 目标。
- environment_status 当前观察有效，HTTP 策略 enforced，DATABASE_URL/DIRECT_URL ready。该工具不报告 TCP grant 或 VPN 健康；TCP 结论来自受支持的策略快照与参考文档。
- 最新文档域名 developers.openai.com 仍未出现在当前生效的 HTTP 策略中，说明配置草稿与运行实例要分开判断。

## 对项目的意义

MCP 使用 HTTPS 管理数据库，与 NestJS/Prisma 的 PostgreSQL 数据连接是两条路径。MCP 可用于工具管理或执行经授权的 SQL，但不应自动绕开 Prisma 迁移记录、另建表结构管理方式；安装成功也不代表 API 数据库请求通过。

当前用户已批准 Mac 本地开发方案，该方案继续有效。若重新选择全云端方案，应使用具备正常 PostgreSQL 网络访问的运行环境或独立评估支持的网络架构；不能仅凭 MCP 登录成功宣布云端 Prisma 接入完成。不要要求用户盲目开通 Tailscale 来直连公网 Supabase。
